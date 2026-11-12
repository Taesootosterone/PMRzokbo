import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { appInfo, pathsFor } from "../lib/update-state.mjs";
import { Updater } from "../lib/updater.mjs";
import { instanceId, profileFromRuntime } from "../lib/mac-profile.mjs";
import {
  ensureMacApps,
  installMacApps,
  inspectMacApps,
} from "../lib/mac-launcher.mjs";

const mode = process.argv[2],
  data = process.env.PMRZ_DATA_DIR,
  installRoot = process.env.PMRZ_INSTALL_ROOT;
if (!data || !installRoot || !["start", "dev"].includes(mode))
  throw new Error("npm start 또는 npm run dev로 실행하세요.");
const current = {
  kind: process.env.PMRZ_RUNNING_COMMIT ? "release" : "baseline",
  sha: process.env.PMRZ_RUNNING_COMMIT || null,
  version: appInfo(process.cwd()).version,
};
const token = randomBytes(32).toString("hex"),
  port = Number(process.env.PMRZ_PORT),
  host = process.env.PMRZ_HOST;
const identity = instanceId(installRoot, data);
const desktop = {
  supported: process.platform === "darwin" && mode === "start",
  installing: false,
  apps: [],
  error: null,
};
async function installDesktop(force = false) {
  if (!desktop.supported)
    throw new Error("Mac 앱 설치는 macOS의 npm start 실행에서 지원합니다.");
  if (desktop.installing) throw new Error("Mac 앱을 설치 중입니다.");
  desktop.installing = true;
  desktop.error = null;
  try {
    desktop.apps = await (force ? installMacApps : ensureMacApps)({
      profile: profileFromRuntime({ project: installRoot }),
    });
  } catch (error) {
    desktop.error = error.message;
    throw error;
  } finally {
    desktop.installing = false;
  }
}
let next,
  stopping = false,
  exiting = false,
  updater,
  disabled;
const require = createRequire(import.meta.url),
  paths = pathsFor(data);
function startServer() {
  stopping = false;
  next = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      mode,
      "--hostname",
      host,
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        PMRZ_UPDATER_PORT: String(control.address().port),
        PMRZ_UPDATER_TOKEN: token,
        PMRZ_INSTANCE_ID: identity,
      },
    },
  );
  next.on("error", () => {
    if (!exiting) process.exit(1);
  });
  next.on("exit", (code) => {
    if (!stopping && !exiting) process.exit(code || 1);
  });
}
async function stopServer() {
  if (!next || next.exitCode !== null || next.signalCode !== null) return;
  stopping = true;
  const done = new Promise((resolve) => next.once("exit", resolve));
  next.kill("SIGTERM");
  const timer = setTimeout(() => next.kill("SIGKILL"), 10000);
  timer.unref();
  await done;
  clearTimeout(timer);
}
const control = createServer(async (req, res) => {
  const given = Buffer.from(String(req.headers["x-pmrz-control"] || "")),
    expected = Buffer.from(token);
  const json = (value, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    json({ error: "Forbidden" }, 403);
    return;
  }
  try {
    if (req.url === "/status" && req.method === "GET") {
      json(
        updater
          ? updater.status()
          : { enabled: false, phase: "idle", current, error: disabled },
      );
      return;
    }
    if (req.url === "/desktop" && req.method === "GET") {
      if (desktop.supported && !desktop.installing)
        desktop.apps = inspectMacApps({
          profile: profileFromRuntime({ project: installRoot }),
        });
      json(desktop);
      return;
    }
    if (req.url === "/desktop" && req.method === "POST") {
      if (
        ["installing", "backup", "restarting"].includes(updater?.status().phase)
      )
        throw new Error("업데이트 완료 후 Mac 앱을 설치하세요.");
      await installDesktop(true);
      json(desktop);
      return;
    }
    if (req.url === "/stop" && req.method === "POST") {
      if (desktop.installing || updater?.busy)
        throw new Error("업데이트 작업 완료 후 중지하세요.");
      json({ stopping: true }, 202);
      setTimeout(() => void shutdown(), 250);
      return;
    }
    if (!updater) throw new Error(disabled);
    if (req.url === "/check" && req.method === "POST") {
      json(updater.check(), 202);
      return;
    }
    if (req.url === "/apply" && req.method === "POST") {
      if (desktop.installing)
        throw new Error("Mac 앱 설치가 끝난 뒤 업데이트를 적용하세요.");
      let raw = "";
      for await (const piece of req) {
        raw += piece;
        if (raw.length > 5000) throw new Error("요청이 너무 큽니다.");
      }
      const value = JSON.parse(raw);
      json(updater.apply(value.sha), 202);
      return;
    }
    json({ error: "Not found" }, 404);
  } catch (error) {
    json({ error: error.message }, 409);
  }
});
await new Promise((resolve, reject) => {
  control.once("error", reject);
  control.listen(0, "127.0.0.1", resolve);
});
try {
  if (mode === "dev")
    throw new Error(
      "개발 모드에서는 업데이트를 적용하지 않습니다. npm start로 실행하세요.",
    );
  updater = new Updater({
    data,
    installRoot,
    current,
    stopServer,
    startServer,
    handoff: async () => {
      exiting = true;
      control.close();
      setImmediate(() => process.exit(75));
    },
  });
} catch (error) {
  disabled = error.message;
}
startServer();
process.on("message", (message) => {
  if (message?.type === "ready" && desktop.supported)
    void installDesktop().catch((error) =>
      console.error(`리햅 Mac 앱 설치: ${error.message}`),
    );
  if (message?.type === "ready" && updater?.config.automatic) {
    const timer = setTimeout(() => {
      try {
        updater.check();
      } catch {}
    }, 1500);
    timer.unref();
    const repeat = setInterval(
      () => {
        try {
          updater.check();
        } catch {}
      },
      updater.config.checkIntervalHours * 60 * 60 * 1000,
    );
    repeat.unref();
  }
});
async function shutdown() {
  if (exiting) return;
  exiting = true;
  await stopServer();
  control.close();
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void shutdown());
process.on("disconnect", () => void shutdown());
