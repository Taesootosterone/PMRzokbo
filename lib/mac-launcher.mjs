import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  lstatSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  macApps,
  macPaths,
  MAC_APP_REVISION,
  readMacProfile,
  validateMacProfile,
} from "./mac-profile.mjs";

const execute = promisify(execFile),
  markerName = "pmrzokbo-control-app.json";
const runnerSource = fileURLToPath(
  new URL("../scripts/mac-runner.mjs", import.meta.url),
);
const iconSource = fileURLToPath(new URL("../mac/rehab.icns", import.meta.url));
const shellQuote = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
const appleString = (value) =>
  `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
export function renderMacAppleScript(profile, paths, action) {
  const app = macApps.find((a) => a.action === action);
  if (!app) throw new Error("지원하지 않는 리햅 동작입니다.");
  const path = [
    dirname(profile.nodePath),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
  const command = `PATH=${shellQuote(path)} ${shellQuote(profile.nodePath)} ${shellQuote(paths.runner)} ${shellQuote(paths.profile)} ${shellQuote(action)}`;
  return `-- 리햅 전용 앱. 고정 동작과 사용자별 실행 경로만 포함합니다.\non run\n  try\n${action === "update" ? `    display notification "최신 버전을 확인하고 백업·설치·재시작합니다. 완료 안내가 나올 때까지 기다려 주세요." with title ${appleString(app.name)}\n` : ""}    with timeout of 2400 seconds\n      set commandResult to do shell script ${appleString(command)}\n    end timeout\n    if commandResult is "" then set commandResult to "작업을 마쳤습니다."\n${["update", "status"].includes(action) ? `    display dialog commandResult with title ${appleString(app.name)} buttons {"확인"} default button "확인"\n` : `    display notification commandResult with title ${appleString(app.name)}\n`}  on error errorText number errorNumber\n    display dialog (errorText & return & return & "리햅 설정의 Mac 앱 설치/복구 또는 최신 코드의 처음설정.command를 확인하세요.") with title ${appleString(app.name)} buttons {"확인"} default button "확인" with icon stop\n  end try\nend run\n`;
}
function info(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function writePrivate(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, value, { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}
function verifyFiles(paths) {
  for (const path of [paths.config, paths.profile, paths.runner])
    if (info(path)?.isSymbolicLink())
      throw new Error(
        "Mac 제어 설정이 심볼릭 링크라 기존 파일을 보존했습니다.",
      );
  if (
    info(paths.runner) &&
    !readFileSync(paths.runner, "utf8").startsWith(
      "// PMRZokbo native control runner v1.",
    )
  )
    throw new Error(
      "기존 제어 실행기를 보존했습니다. 설치 소유 정보를 확인하세요.",
    );
}
function verifyOwned(path, profile, action) {
  const root = info(path);
  if (!root) return null;
  const contents = join(path, "Contents"),
    resources = join(contents, "Resources"),
    file = join(resources, markerName);
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    !info(contents)?.isDirectory() ||
    info(contents)?.isSymbolicLink() ||
    !info(resources)?.isDirectory() ||
    info(resources)?.isSymbolicLink() ||
    !info(file)?.isFile() ||
    info(file)?.isSymbolicLink()
  )
    throw new Error(
      "같은 이름의 기존 앱을 보존했습니다. 리햅 소유 표식을 확인할 수 없습니다.",
    );
  const marker = JSON.parse(readFileSync(file, "utf8"));
  if (
    marker.format !== "pmrzokbo-control-app" ||
    marker.version !== 1 ||
    marker.project !== profile.project ||
    marker.action !== action
  )
    throw new Error(
      "다른 설치의 동명 앱을 보존했습니다. 기존 리햅 설치 경로를 확인하세요.",
    );
  return { marker, ino: root.ino, dev: root.dev };
}
function verifyProfile(paths, profile) {
  verifyFiles(paths);
  if (!existsSync(paths.profile)) return;
  if (info(paths.profile).isSymbolicLink())
    throw new Error("Mac 앱 설정이 심볼릭 링크라 보존했습니다.");
  const old = readMacProfile(paths.profile);
  if (old.project !== profile.project || old.data !== profile.data)
    throw new Error(
      "다른 리햅 설치의 Mac 설정을 보존했습니다. 기존 설치 경로와 데이터를 확인하세요.",
    );
}
export function inspectMacApps({ home, profile }) {
  const paths = macPaths(home);
  return macApps.map((app) => {
    const path = join(paths.applications, `${app.name}.app`);
    let installed = false;
    try {
      const found = verifyOwned(path, profile, app.action);
      installed =
        !!found &&
        found.marker.revision === MAC_APP_REVISION &&
        found.marker.nodePath === profile.nodePath;
    } catch {}
    return { ...app, path, installed };
  });
}
export async function installMacApps({
  profile: input,
  home,
  run,
  platform = process.platform,
}) {
  const profile = validateMacProfile(input),
    paths = macPaths(home);
  if (platform !== "darwin" && !run)
    throw new Error("Mac 제어 앱은 실제 macOS에서 설치하세요.");
  verifyProfile(paths, profile);
  mkdirSync(paths.applications, { recursive: true, mode: 0o700 });
  mkdirSync(paths.config, { recursive: true, mode: 0o700 });
  const records = macApps.map((app) => ({
    app,
    destination: join(paths.applications, `${app.name}.app`),
    previous: null,
    swapped: false,
    backedUp: false,
  }));
  for (const record of records)
    record.previous = verifyOwned(
      record.destination,
      profile,
      record.app.action,
    );
  const compile = run || execute;
  const previousProfile = existsSync(paths.profile)
    ? readFileSync(paths.profile)
    : null;
  const previousRunner = existsSync(paths.runner)
    ? readFileSync(paths.runner)
    : null;
  const stage = mkdtempSync(join(paths.applications, ".pmrzokbo-apps-"));
  let preserve = false;
  try {
    for (const record of records) {
      const action = record.app.action;
      record.staged = join(stage, `${action}.app`);
      record.backup = join(stage, `${action}.old.app`);
      const script = join(stage, `${action}.applescript`);
      writeFileSync(script, renderMacAppleScript(profile, paths, action), {
        mode: 0o600,
      });
      const result = await compile(
        "/usr/bin/osacompile",
        ["-o", record.staged, script],
        { cwd: profile.project, encoding: "utf8", timeout: 60000 },
      );
      if (
        (result?.status && result.status !== 0) ||
        !info(record.staged)?.isDirectory() ||
        info(record.staged)?.isSymbolicLink()
      )
        throw new Error("Mac 제어 앱 컴파일을 완료하지 못했습니다.");
      const resources = join(record.staged, "Contents", "Resources");
      mkdirSync(resources, { recursive: true });
      writeFileSync(
        join(resources, markerName),
        JSON.stringify(
          {
            format: "pmrzokbo-control-app",
            version: 1,
            project: profile.project,
            action,
            revision: MAC_APP_REVISION,
            nodePath: profile.nodePath,
          },
          null,
          2,
        ),
        { flag: "wx", mode: 0o600 },
      );
      writeFileSync(join(resources, "applet.icns"), readFileSync(iconSource), {
        mode: 0o644,
      });
    }
    for (const record of records) {
      const current = verifyOwned(
        record.destination,
        profile,
        record.app.action,
      );
      if (
        !!current != !!record.previous ||
        (current &&
          (current.ino !== record.previous.ino ||
            current.dev !== record.previous.dev))
      )
        throw new Error("설치 도중 앱이 바뀌어 기존 상태를 보존합니다.");
      if (record.previous) {
        renameSync(record.destination, record.backup);
        record.backedUp = true;
      }
      renameSync(record.staged, record.destination);
      record.swapped = true;
    }
    writePrivate(paths.runner, readFileSync(runnerSource));
    writePrivate(paths.profile, JSON.stringify(profile, null, 2));
    return inspectMacApps({ home, profile });
  } catch (error) {
    try {
      for (const record of [...records].reverse()) {
        if (record.swapped) rmSync(record.destination, { recursive: true });
        if (record.backedUp) renameSync(record.backup, record.destination);
      }
      if (previousRunner) writePrivate(paths.runner, previousRunner);
      else if (existsSync(paths.runner)) rmSync(paths.runner);
      if (previousProfile) writePrivate(paths.profile, previousProfile);
      else if (existsSync(paths.profile)) rmSync(paths.profile);
    } catch {
      preserve = true;
      throw new Error(
        `Mac 앱 복구를 완료하지 못했습니다. 이전 앱 보존 경로: ${stage}`,
      );
    }
    throw error;
  } finally {
    if (!preserve) rmSync(stage, { recursive: true, force: true });
  }
}
export async function ensureMacApps(options) {
  const paths = macPaths(options.home);
  verifyProfile(paths, options.profile);
  const apps = inspectMacApps(options);
  if (
    apps.some((app) => !app.installed) ||
    !existsSync(paths.runner) ||
    readFileSync(paths.runner, "utf8") !== readFileSync(runnerSource, "utf8")
  )
    return installMacApps(options);
  if (
    !existsSync(paths.profile) ||
    JSON.stringify(readMacProfile(paths.profile)) !==
      JSON.stringify(options.profile)
  )
    writePrivate(paths.profile, JSON.stringify(options.profile, null, 2));
  return apps;
}
