// Stable launcher: run npm start from the original installation folder.
import { loadEnvFile } from "node:process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { dataDirectory } from "../lib/config.mjs";
import {
  appInfo,
  pathsFor,
  readJson,
  writeJson,
  saveState,
  targetDirectory,
  assertSeparateData,
} from "../lib/update-state.mjs";

const installRoot = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);
if (existsSync(join(installRoot, ".env.local")))
  loadEnvFile(join(installRoot, ".env.local"));
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("Node.js 24 LTS가 필요합니다.");
const mode = process.argv[2] || "start";
if (!["start", "dev"].includes(mode))
  throw new Error("start 또는 dev로 실행하세요.");
const port = Number(process.env.PMRZ_PORT || 4310),
  host = process.env.PMRZ_HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PMRZ_PORT는 1~65535여야 합니다.");
mkdirSync(dataDirectory(), { recursive: true, mode: 0o700 });
const data = realpathSync(dataDirectory());
assertSeparateData(installRoot, data);
const paths = pathsFor(data),
  baseline = {
    kind: "baseline",
    sha: null,
    version: appInfo(installRoot).version,
  };
const lock = join(data, ".server.lock"),
  launcherLock = join(data, ".launcher.lock");
for (const currentLock of [launcherLock, lock])
  if (existsSync(currentLock)) {
    const pid = Number(readFileSync(currentLock, "utf8"));
    if (!Number.isInteger(pid) || pid < 1)
      throw new Error("실행 잠금 정보를 확인하세요.");
    try {
      process.kill(pid, 0);
      throw new Error("같은 데이터 폴더의 앱이 이미 실행 중입니다.");
    } catch (e) {
      if (e.code !== "ESRCH") throw e;
      unlinkSync(currentLock);
    }
  }
writeFileSync(launcherLock, String(process.pid), { flag: "wx", mode: 0o600 });
writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
let owner = String(process.pid),
  child,
  shuttingDown = false;
const env = {
  ...process.env,
  PMRZ_INSTALL_ROOT: installRoot,
  PMRZ_DATA_DIR: data,
  PMRZ_PORT: String(port),
  PMRZ_HOST: host,
  PATH: `${dirname(process.execPath)}:${process.env.PATH || ""}`,
};
const timeout = Math.min(
  120000,
  Math.max(1000, Number(env.PMRZ_UPDATE_READY_TIMEOUT_MS) || 60000),
);
function cleanup() {
  try {
    if (readFileSync(lock, "utf8") === owner) unlinkSync(lock);
  } catch {}
  try {
    if (readFileSync(launcherLock, "utf8") === String(process.pid))
      unlinkSync(launcherLock);
  } catch {}
}
async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
  timer.unref();
  await exited;
  clearTimeout(timer);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void stopChild().finally(() => {
      cleanup();
      process.exit(0);
    });
  });
process.on("exit", cleanup);
async function ready(target) {
  const until = Date.now() + timeout;
  while (Date.now() < until && !shuttingDown) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      throw new Error("새 서버가 시작 중 종료되었습니다.");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const value = await response.json();
        if (
          value.app === "pmrzokbo" &&
          value.commit === (target.sha || null) &&
          value.version === target.version
        )
          return;
      }
    } catch {}
    await delay(300);
  }
  throw new Error("서버 응답을 확인하지 못했습니다.");
}
console.log(`PMRZokbo · http://${host}:${port}\n데이터: ${data}\n중지: Ctrl+C`);
try {
  while (!shuttingDown) {
    let target = mode === "dev" ? baseline : readJson(paths.active, baseline);
    let runtime;
    try {
      runtime = targetDirectory(target, installRoot, paths);
    } catch {
      target = baseline;
      runtime = installRoot;
      writeJson(paths.active, baseline);
      saveState(paths, {
        phase: "rolled-back",
        current: baseline,
        error: "설치 버전을 읽지 못해 최초 설치 코드로 복구했습니다.",
      });
    }
    child = spawn(
      process.execPath,
      [join(runtime, "scripts/supervisor.mjs"), mode],
      {
        cwd: runtime,
        env: {
          ...env,
          PMRZ_RUNNING_COMMIT: target.sha || "",
          PMRZ_RUNNING_VERSION: target.version,
        },
        stdio: ["inherit", "inherit", "inherit", "ipc"],
      },
    );
    const exit = new Promise((resolve) => {
      child.once("exit", (code) => resolve(code));
      child.once("error", () => resolve(1));
    });
    if (child.pid) {
      owner = String(child.pid);
      writeFileSync(lock, owner, { mode: 0o600 });
    }
    const pending = readJson(paths.pending);
    try {
      await ready(target);
      if (shuttingDown) break;
      if (pending && target.sha === pending.target.sha) {
        unlinkSync(paths.pending);
        saveState(paths, {
          phase: "idle",
          current: target,
          candidate: null,
          error: null,
          lastResult: {
            kind: "applied",
            sha: target.sha,
            at: new Date().toISOString(),
          },
        });
      }
      child.send?.({ type: "ready" });
    } catch (error) {
      await stopChild();
      if (shuttingDown) break;
      if (pending) {
        targetDirectory(pending.previous, installRoot, paths);
        writeJson(paths.active, pending.previous);
        unlinkSync(paths.pending);
        saveState(paths, {
          phase: "rolled-back",
          current: pending.previous,
          candidate: null,
          error:
            "새 버전의 실행 확인에 실패해 이전 코드로 복구했습니다. 사용자 데이터는 교체하지 않았습니다.",
          lastResult: {
            kind: "rolled-back",
            sha: pending.target.sha,
            at: new Date().toISOString(),
          },
        });
        continue;
      }
      throw error;
    }
    const code = await exit;
    if (shuttingDown) break;
    if (code === 75) continue;
    process.exitCode = Number(code) || 0;
    break;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  await stopChild();
} finally {
  cleanup();
}
