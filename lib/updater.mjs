import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { GitHubSource, inventory, runCommand } from "./update-source.mjs";
import {
  appInfo,
  pathsFor,
  readJson,
  saveState,
  updateConfig,
  writeJson,
  shaPattern,
} from "./update-state.mjs";
import { createBackup } from "./backup.mjs";

export class Updater {
  constructor({
    data,
    installRoot,
    current,
    stopServer,
    startServer,
    handoff,
    env = process.env,
    source,
  }) {
    Object.assign(this, {
      data,
      installRoot,
      current,
      stopServer,
      startServer,
      handoff,
      env,
    });
    this.paths = pathsFor(data);
    this.config = updateConfig(env);
    this.source = source || new GitHubSource(this.config, env);
    this.busy = false;
    const old = readJson(this.paths.state, {});
    saveState(this.paths, {
      current,
      phase: ["restarting", "rolled-back"].includes(old.phase)
        ? old.phase
        : old.candidate
          ? "ready"
          : "idle",
      error: old.phase === "rolled-back" ? old.error : null,
    });
  }
  status() {
    return {
      ...readJson(this.paths.state, {}),
      enabled: true,
      ...this.config,
      current: this.current,
    };
  }
  check() {
    if (this.busy) throw new Error("다른 업데이트 작업이 진행 중입니다.");
    this.busy = true;
    saveState(this.paths, { phase: "checking", error: null });
    void this.checkOperation()
      .catch((e) => saveState(this.paths, { phase: "error", error: e.message }))
      .finally(() => {
        this.busy = false;
      });
    return this.status();
  }
  async checkOperation() {
    const sha = await this.source.latest();
    if (sha === this.current.sha) {
      saveState(this.paths, {
        phase: "idle",
        candidate: null,
        lastCheckedAt: new Date().toISOString(),
        error: null,
      });
      return;
    }
    const candidate = readJson(this.paths.state, {}).candidate;
    if (
      candidate?.sha === sha &&
      existsSync(join(this.paths.downloads, sha)) &&
      inventory(join(this.paths.downloads, sha)) === candidate.digest
    ) {
      saveState(this.paths, {
        phase: "ready",
        lastCheckedAt: new Date().toISOString(),
      });
      return;
    }
    mkdirSync(this.paths.downloads, { recursive: true, mode: 0o700 });
    saveState(this.paths, { phase: "downloading", candidate: null });
    const result = await this.source.download(sha, this.paths.downloads);
    try {
      const dest = join(this.paths.downloads, sha);
      if (existsSync(dest)) rmSync(dest, { recursive: true });
      renameSync(result.stage, dest);
      saveState(this.paths, {
        phase: "ready",
        candidate: { sha, version: result.version, digest: result.digest },
        lastCheckedAt: new Date().toISOString(),
        error: null,
      });
    } finally {
      rmSync(result.work, { recursive: true, force: true });
    }
  }
  apply(sha) {
    if (this.busy) throw new Error("다른 업데이트 작업이 진행 중입니다.");
    const candidate = readJson(this.paths.state, {}).candidate;
    if (!shaPattern.test(sha || "") || candidate?.sha !== sha)
      throw new Error("확인한 다운로드 버전을 다시 선택하세요.");
    this.busy = true;
    saveState(this.paths, {
      phase: "installing",
      error: null,
      lastResult: null,
    });
    void this.applyOperation(candidate)
      .catch((e) => saveState(this.paths, { phase: "error", error: e.message }))
      .finally(() => {
        this.busy = false;
      });
    return this.status();
  }
  async applyOperation(candidate) {
    const download = join(this.paths.downloads, candidate.sha);
    if (inventory(download) !== candidate.digest)
      throw new Error(
        "다운로드한 코드가 변경되었습니다. 업데이트를 다시 확인하세요.",
      );
    mkdirSync(this.paths.releases, { recursive: true, mode: 0o700 });
    const build = mkdtempSync(join(this.paths.releases, "build-"));
    let stopped = false;
    try {
      cpSync(download, build, { recursive: true });
      appInfo(build);
      const env = {
        ...this.env,
        NPM_CONFIG_CACHE:
          this.env.NPM_CONFIG_CACHE || join(this.paths.root, "npm-cache"),
      };
      await runCommand(
        "npm",
        ["ci", "--include=dev", "--no-audit", "--no-fund"],
        {
          cwd: build,
          env: { ...env, NODE_ENV: "development" },
          timeout: 10 * 60 * 1000,
          message:
            "새 버전의 의존성 설치에 실패했습니다. 기존 앱은 유지됩니다. 네트워크·디스크 공간을 확인하고 다시 시도하세요.",
        },
      );
      await runCommand("npm", ["run", "build"], {
        cwd: build,
        env: { ...env, NODE_ENV: "production" },
        timeout: 10 * 60 * 1000,
        message:
          "새 버전 빌드에 실패했습니다. 기존 앱은 유지됩니다. GitHub 코드를 수정한 뒤 다시 확인하세요.",
      });
      writeJson(join(build, ".pmrz-ready.json"), {
        sha: candidate.sha,
        version: candidate.version,
      });
      const release = join(this.paths.releases, candidate.sha);
      if (existsSync(release)) {
        if (this.current.sha === candidate.sha)
          throw new Error("현재 실행 중인 버전은 교체할 수 없습니다.");
        rmSync(release, { recursive: true });
      }
      renameSync(build, release);
      saveState(this.paths, { phase: "backup" });
      await this.stopServer();
      stopped = true;
      mkdirSync(this.paths.backups, { recursive: true, mode: 0o700 });
      const backup = join(
        this.paths.backups,
        `before-update-${Date.now()}-${candidate.sha.slice(0, 12)}.pmrz`,
      );
      await createBackup(this.data, backup);
      const target = {
        kind: "release",
        sha: candidate.sha,
        version: candidate.version,
      };
      writeJson(this.paths.pending, { previous: this.current, target, backup });
      writeJson(this.paths.active, target);
      saveState(this.paths, {
        phase: "restarting",
        backupAvailable: true,
        error: null,
      });
      await this.handoff();
    } catch (e) {
      if (stopped) await this.startServer();
      throw e;
    } finally {
      if (existsSync(build)) rmSync(build, { recursive: true, force: true });
    }
  }
}
