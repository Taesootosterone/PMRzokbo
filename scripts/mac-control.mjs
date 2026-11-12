import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  lstatSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  macPaths,
  readMacProfile,
  profileEnvironment,
} from "../lib/mac-profile.mjs";
import { appInfo, assertSeparateData } from "../lib/update-state.mjs";

const execute = promisify(execFile);
export function acquireControlLock(file) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const value = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, value, { flag: "wx", mode: 0o600 });
      return () => {
        try {
          if (readFileSync(file, "utf8") === value) unlinkSync(file);
        } catch {}
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (lstatSync(file).isSymbolicLink())
        throw new Error("제어 잠금이 심볼릭 링크라 보존했습니다.");
      const previous = readFileSync(file, "utf8");
      let pid;
      try {
        pid = JSON.parse(previous).pid;
      } catch {
        throw new Error(
          "리햅 제어 잠금을 확인하세요. 기존 파일은 보존했습니다.",
        );
      }
      if (!Number.isInteger(pid) || pid < 1)
        throw new Error("리햅 제어 잠금 정보가 올바르지 않습니다.");
      try {
        process.kill(pid, 0);
        throw new Error(
          "다른 리햅 앱이 작업 중입니다. 완료 후 다시 실행하세요.",
        );
      } catch (e) {
        if (e.code !== "ESRCH") throw e;
      }
      if (readFileSync(file, "utf8") === previous) unlinkSync(file);
    }
  }
  throw new Error("다른 리햅 앱이 작업 중입니다.");
}

export async function runMacAction(
  action,
  {
    profileFile = macPaths().profile,
    openBrowser = async (url) => {
      await execute("/usr/bin/open", [url]);
    },
    timeoutMs = 30 * 60 * 1000,
    pollMs = 1000,
  } = {},
) {
  if (!["open", "update", "stop", "status"].includes(action))
    throw new Error("지원하지 않는 리햅 동작입니다.");
  const profile = readMacProfile(profileFile);
  appInfo(profile.project);
  mkdirSync(profile.data, { recursive: true, mode: 0o700 });
  assertSeparateData(profile.project, profile.data);
  const base = `http://127.0.0.1:${profile.port}`,
    url = `${base}/`,
    deadline = Date.now() + timeoutMs;
  const request = async (path, body) => {
    const response = await fetch(`${base}/api/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error || `서버 요청 실패 (${response.status})`);
    return value;
  };
  let verified = false;
  const health = async () => {
    let response;
    try {
      response = await fetch(`${base}/api/v1/health`, {
        signal: AbortSignal.timeout(1500),
      });
    } catch (error) {
      if (
        error.cause?.code === "ECONNREFUSED" ||
        (verified &&
          (["ECONNRESET", "UND_ERR_SOCKET"].includes(error.cause?.code) ||
            error.name === "TimeoutError"))
      )
        return null;
      throw new Error(
        "서버 응답을 확인하지 못했습니다. 포트를 사용하는 다른 서비스가 있는지 확인하세요.",
      );
    }
    let value;
    try {
      value = await response.json();
    } catch {
      throw new Error(
        "이 포트에 다른 서비스가 응답합니다. 다른 서버는 변경하지 않았습니다.",
      );
    }
    if (!response.ok) {
      if (verified && response.status === 503) return null;
      throw new Error(
        "리햅 서버가 아직 준비되지 않았습니다. 잠시 후 다시 실행하세요.",
      );
    }
    if (value.app !== "pmrzokbo" || value.instanceId !== profile.instanceId)
      throw new Error(
        "다른 서버 또는 이전 리햅 버전이 실행 중입니다. 기존 터미널 서버를 중지하거나 웹 설정에서 먼저 업데이트하세요.",
      );
    verified = true;
    return value;
  };
  const initial = await health();
  if (action === "status")
    return initial
      ? `리햅 v${initial.version} 실행 중\n${url}\n데이터: ${profile.data}\n업데이트: ${(await request("updates")).phase}`
      : `리햅이 중지되어 있습니다.\n데이터: ${profile.data}`;
  const release = acquireControlLock(
    join(dirname(profileFile), "control.lock"),
  );
  const launcherRunning = () => {
    for (const name of [".launcher.lock", ".server.lock"]) {
      const file = join(profile.data, name);
      if (!existsSync(file)) continue;
      const pid = Number(readFileSync(file, "utf8"));
      if (!Number.isInteger(pid) || pid < 1)
        throw new Error("기존 서버 잠금을 확인하세요.");
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    return false;
  };
  const pollStatus = async () => {
    if (!(await health())) return null;
    try {
      return await request("updates");
    } catch (error) {
      if (error instanceof TypeError || error.name === "TimeoutError")
        return null;
      throw error;
    }
  };
  try {
    let running = await health();
    if (action === "stop") {
      if (!running) return "리햅이 이미 중지되어 있습니다.";
      await request("desktop/stop", {});
      const until = Date.now() + 20000;
      while (Date.now() < until) {
        if (!(await health()) && !launcherRunning())
          return "리햅 서버를 중지했습니다. 저장된 데이터는 유지됩니다.";
        await delay(pollMs);
      }
      throw new Error(
        "중지 완료를 아직 확인하지 못했습니다. 리햅 상태 앱을 확인하세요.",
      );
    }
    if (!running) {
      const node = await execute(
        profile.nodePath,
        ["-p", 'process.versions.node.split(".")[0]'],
        { timeout: 10000 },
      );
      if (node.stdout.trim() !== "24")
        throw new Error(
          "기억된 Node.js가 24 버전이 아닙니다. Node 24로 Mac 앱을 다시 설치하세요.",
        );
      const startBackground = async () => {
        const logs = join(profile.data, "desktop", "logs");
        mkdirSync(logs, { recursive: true, mode: 0o700 });
        const log = openSync(join(logs, "server.log"), "a", 0o600);
        try {
          const child = spawn(
            profile.nodePath,
            [join(profile.project, "scripts/serve.mjs"), "start"],
            {
              cwd: profile.project,
              env: profileEnvironment(profile),
              detached: true,
              stdio: ["ignore", log, log],
            },
          );
          await new Promise((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          child.unref();
        } finally {
          closeSync(log);
        }
      };
      let launched = false;
      const until = Date.now() + 90000;
      while (Date.now() < until) {
        running = await health();
        if (running) break;
        if (!launched && !launcherRunning()) {
          await startBackground();
          launched = true;
        }
        await delay(pollMs);
      }
      if (!running)
        throw new Error(
          `리햅을 시작하지 못했습니다. 로그: ${join(profile.data, "desktop/logs/server.log")}`,
        );
    }
    if (action === "open") {
      await openBrowser(url);
      return "리햅을 브라우저에서 열었습니다. 서버는 백그라운드에서 실행됩니다.";
    }
    let status = await request("updates");
    if (!status.enabled)
      throw new Error(
        status.error || "이 실행 방식에서는 업데이트할 수 없습니다.",
      );
    // Wait for an automatic check or an existing web update; never submit the same apply twice.
    while (
      [
        "checking",
        "downloading",
        "installing",
        "backup",
        "restarting",
      ].includes(status.phase)
    ) {
      await delay(pollMs);
      if (Date.now() > deadline)
        throw new Error(
          "작업이 오래 걸립니다. 리햅 상태와 서버 로그를 확인하세요.",
        );
      const next = await pollStatus();
      if (next) status = next;
    }
    await request("updates/check", {});
    while (true) {
      if (Date.now() > deadline)
        throw new Error("최신 버전 확인 시간이 초과되었습니다.");
      await delay(pollMs);
      const next = await pollStatus();
      if (!next) continue;
      status = next;
      if (!["checking", "downloading"].includes(status.phase)) break;
    }
    if (["error", "rolled-back"].includes(status.phase))
      throw new Error(status.error || "최신 버전을 확인하지 못했습니다.");
    if (!status.candidate)
      return `이미 최신 버전입니다. (v${status.current.version})`;
    const target = status.candidate.sha;
    while ((await request("desktop")).installing) {
      if (Date.now() > deadline)
        throw new Error("Mac 앱 설치 완료를 기다리는 시간이 초과되었습니다.");
      await delay(pollMs);
    }
    await request("updates/apply", { sha: target });
    while (Date.now() < deadline) {
      await delay(pollMs);
      const next = await pollStatus();
      if (!next) continue;
      status = next;
      if (
        status.current.sha === target &&
        status.phase === "idle" &&
        status.lastResult?.kind === "applied"
      )
        return `리햅 v${status.current.version} 업데이트를 마쳤습니다.\n전체 데이터 백업 후 새 버전으로 재시작했습니다.\n${url}`;
      if (["error", "rolled-back"].includes(status.phase))
        throw new Error(
          status.error || "업데이트 실패로 이전 코드를 유지했습니다.",
        );
    }
    throw new Error(
      "업데이트 완료 확인 시간이 초과되었습니다. 서버 상태를 확인하세요. 작업을 강제로 종료하지 않았습니다.",
    );
  } finally {
    release();
  }
}
