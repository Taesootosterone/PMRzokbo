import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import {
  macPaths,
  profileFromRuntime,
  readMacProfile,
} from "../lib/mac-profile.mjs";
import { ensureMacApps } from "../lib/mac-launcher.mjs";
import { runMacAction } from "./mac-control.mjs";
import {
  appInfo,
  pathsFor,
  readJson,
  targetDirectory,
  assertSeparateData,
} from "../lib/update-state.mjs";
import { mkdirSync } from "node:fs";
import { runCommand } from "../lib/update-source.mjs";

try {
  if (process.platform !== "darwin")
    throw new Error("이 명령은 실제 macOS에서 실행하세요.");
  if (process.versions.node.split(".")[0] !== "24")
    throw new Error("Node.js 24로 실행하세요.");
  const action = process.argv[2] || "setup",
    paths = macPaths();
  if (action !== "setup") {
    console.log(await runMacAction(action));
  } else {
    const project = resolve(
      process.env.PMRZ_INSTALL_ROOT ||
        dirname(fileURLToPath(new URL("../package.json", import.meta.url))),
    );
    appInfo(project);
    if (existsSync(`${project}/.env.local`))
      loadEnvFile(`${project}/.env.local`);
    const previous = existsSync(paths.profile)
      ? readMacProfile(paths.profile)
      : null;
    const profile = profileFromRuntime({ project, previous });
    mkdirSync(profile.data, { recursive: true, mode: 0o700 });
    assertSeparateData(project, profile.data);
    const runtime = targetDirectory(
      readJson(pathsFor(profile.data).active, { kind: "baseline" }),
      project,
      pathsFor(profile.data),
    );
    if (!existsSync(`${runtime}/node_modules/next/package.json`))
      await runCommand(
        "npm",
        ["ci", "--include=dev", "--no-audit", "--no-fund"],
        { cwd: runtime, timeout: 600000, message: "의존성 설치 실패" },
      );
    if (!existsSync(`${runtime}/.next/BUILD_ID`))
      await runCommand("npm", ["run", "build"], {
        cwd: runtime,
        timeout: 600000,
        message: "앱 빌드 실패",
      });
    const apps = await ensureMacApps({ profile });
    console.log(apps.map((app) => app.path).join("\n"));
    console.log(
      "설치를 마쳤습니다. 리햅 열기.app 또는 리햅 업데이트.app을 더블클릭하세요.",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
