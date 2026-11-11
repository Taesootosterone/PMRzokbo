import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, basename } from "node:path";
import { appInfo, shaPattern, writeJson } from "./update-state.mjs";

export function runCommand(
  command,
  args,
  {
    cwd,
    env = process.env,
    timeout = 60000,
    message = "명령을 실행하지 못했습니다.",
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = Buffer.alloc(0),
      settled = false;
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    timer.unref();
    child.stdout.on("data", (chunk) => {
      if (output.length + chunk.length > 8 * 1024 * 1024) {
        child.kill("SIGKILL");
      } else output = Buffer.concat([output, chunk]);
    });
    // Git credential helpers and package scripts may print private values. Do not persist their output.
    child.stderr.resume();
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(message));
      }
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(new Error(message));
    });
  });
}
export function safeSourcePath(path) {
  const parts = path.split("/");
  if (
    !path ||
    path.length > 700 ||
    path.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(path) ||
    parts.some((p) => !p || p === "." || p === "..")
  )
    return false;
  if (
    parts.some((p) =>
      [".git", "node_modules", ".next", "data", "backups", "updates"].includes(
        p.toLowerCase(),
      ),
    )
  )
    return false;
  if (
    parts.some(
      (p) =>
        (p.toLowerCase().startsWith(".env") && p !== ".env.example") ||
        [".npmrc", ".pmrz-ready.json"].includes(p.toLowerCase()),
    )
  )
    return false;
  if (/\.(sqlite(?:-wal|-shm)?|db|pmrz)$/i.test(path)) return false;
  return true;
}
export function inventory(directory) {
  const files = [];
  function walk(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!safeSourcePath(path))
        throw new Error(
          "개인 설정·데이터 또는 허용하지 않는 경로가 업데이트에 포함돼 있습니다.",
        );
      const stat = lstatSync(join(dir, entry.name));
      if (stat.isSymbolicLink())
        throw new Error("업데이트에 심볼릭 링크를 포함할 수 없습니다.");
      if (stat.isDirectory()) walk(join(dir, entry.name), path);
      else if (stat.isFile())
        files.push({
          path,
          sha256: createHash("sha256")
            .update(readFileSync(join(dir, entry.name)))
            .digest("hex"),
          executable: !!(stat.mode & 0o111),
        });
      else throw new Error("업데이트 파일 형식이 올바르지 않습니다.");
    }
  }
  walk(directory);
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
export class GitHubSource {
  constructor(config, env = process.env) {
    this.config = config;
    this.env = { ...env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
    this.url = `https://github.com/${config.repository}.git`;
  }
  async latest() {
    const raw = await runCommand(
      "git",
      ["ls-remote", this.url, `refs/heads/${this.config.branch}`],
      {
        env: this.env,
        message:
          "GitHub 저장소를 읽지 못했습니다. Git 설치·저장소 읽기 권한·네트워크를 확인하세요. 비공개 저장소는 이 Mac의 Git 인증 설정이 필요합니다.",
      },
    );
    const entry = raw
      .toString("utf8")
      .trim()
      .split("\n")
      .find((line) => line.endsWith(`\trefs/heads/${this.config.branch}`));
    const sha = entry?.split("\t")[0];
    if (!shaPattern.test(sha || ""))
      throw new Error(
        "GitHub에 지정한 브랜치가 없습니다. 문제은행 코드를 먼저 업로드하세요.",
      );
    return sha;
  }
  async download(sha, directory) {
    if (!shaPattern.test(sha)) throw new Error("커밋 ID가 올바르지 않습니다.");
    const work = mkdtempSync(join(directory, "fetch-"));
    const stage = join(work, "source"),
      git = join(work, "objects.git"),
      archive = join(work, "source.tar");
    mkdirSync(stage);
    try {
      await runCommand("git", ["init", "--bare", git], {
        env: this.env,
        message: "Git을 초기화하지 못했습니다. Git 설치를 확인하세요.",
      });
      const options = {
        env: this.env,
        message:
          "GitHub 코드 다운로드에 실패했습니다. 인증·네트워크·커밋 접근 권한을 확인하세요.",
      };
      await runCommand(
        "git",
        ["--git-dir", git, "fetch", "--no-tags", "--depth=1", this.url, sha],
        options,
      );
      const actual = (
        await runCommand(
          "git",
          ["--git-dir", git, "rev-parse", "FETCH_HEAD"],
          options,
        )
      )
        .toString()
        .trim();
      if (actual !== sha)
        throw new Error("다운로드한 커밋이 요청한 버전과 다릅니다.");
      const entries = (
        await runCommand(
          "git",
          ["--git-dir", git, "ls-tree", "-r", "-l", "-z", sha],
          options,
        )
      )
        .toString()
        .split("\0")
        .filter(Boolean);
      if (!entries.length || entries.length > 20000)
        throw new Error("업데이트 파일 수가 허용 범위를 벗어났습니다.");
      let bytes = 0;
      const names = new Set();
      for (const entry of entries) {
        const tab = entry.indexOf("\t"),
          path = entry.slice(tab + 1),
          [mode, type, , size] = entry.slice(0, tab).trim().split(/\s+/);
        if (
          !["100644", "100755"].includes(mode) ||
          type !== "blob" ||
          !safeSourcePath(path)
        )
          throw new Error(
            "데이터·설정·심볼릭 링크·서브모듈을 포함한 업데이트는 적용할 수 없습니다.",
          );
        if (names.has(path.toLowerCase()))
          throw new Error(
            "대소문자만 다른 파일은 업데이트에 포함할 수 없습니다.",
          );
        names.add(path.toLowerCase());
        bytes += Number(size);
        if (!Number.isFinite(bytes) || bytes > 100 * 1024 * 1024)
          throw new Error(
            "업데이트 소스는 100MB 이하여야 합니다. 빌드 결과와 데이터를 제외하세요.",
          );
      }
      await runCommand(
        "git",
        [
          "--git-dir",
          git,
          "archive",
          "--format=tar",
          `--output=${archive}`,
          sha,
        ],
        options,
      );
      await runCommand("tar", ["-xf", archive, "-C", stage], {
        message: "업데이트 압축 해제에 실패했습니다. tar 설치를 확인하세요.",
      });
      const info = appInfo(stage),
        digest = inventory(stage);
      return { work, stage, sha, version: info.version, digest };
    } catch (e) {
      rmSync(work, { recursive: true, force: true });
      throw e;
    }
  }
}
