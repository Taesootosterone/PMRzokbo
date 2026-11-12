import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { dataDirectory } from "./config.mjs";
import { updateConfig } from "./update-state.mjs";

export const MAC_PROFILE_FORMAT = "pmrzokbo-mac-control";
export const MAC_APP_REVISION = 1;
export const macApps = [
  { action: "open", name: "리햅 열기" },
  { action: "update", name: "리햅 업데이트" },
  { action: "stop", name: "리햅 중지" },
  { action: "status", name: "리햅 상태" },
];
export function macPaths(home = homedir()) {
  const config = join(home, ".config", "pmrzokbo");
  return {
    home,
    config,
    profile: join(config, "mac.json"),
    runner: join(config, "control.mjs"),
    lock: join(config, "control.lock"),
    applications: join(home, "Applications"),
  };
}
function absolute(value, label) {
  if (
    typeof value !== "string" ||
    !isAbsolute(value) ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error(`${label}에 올바른 절대 경로가 필요합니다.`);
  const path = resolve(value);
  return existsSync(path) ? realpathSync(path) : path;
}
export function instanceId(project, data) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        absolute(project, "설치 경로"),
        absolute(data, "데이터 경로"),
      ]),
    )
    .digest("hex");
}
export function validateMacProfile(input) {
  if (input?.format !== MAC_PROFILE_FORMAT || input.version !== 1)
    throw new Error(
      "리햅 Mac 앱 설정 형식을 확인하세요. 기존 설정은 보존했습니다.",
    );
  const project = absolute(input.project, "설치 경로"),
    data = absolute(input.data, "데이터 경로"),
    nodePath = absolute(input.nodePath, "Node 경로");
  if (project.split(/[\\/]/).some((p) => p.toLowerCase() === "pmrtest"))
    throw new Error("PMRtest는 리햅 설치 경로로 사용할 수 없습니다.");
  if (
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    typeof input.host !== "string" ||
    !/^[A-Za-z0-9.:-]+$/.test(input.host)
  )
    throw new Error("리햅 서버의 주소와 포트를 확인하세요.");
  const update = updateConfig({
    PMRZ_UPDATE_REPOSITORY: input.update?.repository,
    PMRZ_UPDATE_BRANCH: input.update?.branch,
    PMRZ_UPDATE_CHECK_HOURS: String(input.update?.checkIntervalHours || 6),
    PMRZ_AUTO_UPDATE_CHECK: input.update?.automatic === false ? "0" : "1",
  });
  if (input.instanceId !== instanceId(project, data))
    throw new Error("리햅 Mac 앱의 서버 식별 정보가 일치하지 않습니다.");
  return {
    format: MAC_PROFILE_FORMAT,
    version: 1,
    project,
    data,
    nodePath,
    host: input.host,
    port: input.port,
    update,
    instanceId: input.instanceId,
  };
}
export function readMacProfile(file) {
  return validateMacProfile(JSON.parse(readFileSync(file, "utf8")));
}
/** @param {{project?: string, nodePath?: string, env?: Record<string,string|undefined>, previous?: ReturnType<typeof validateMacProfile>|null}} options */
export function profileFromRuntime({
  project,
  nodePath = process.execPath,
  env = process.env,
  previous = null,
} = {}) {
  const data = env.PMRZ_DATA_DIR || previous?.data || dataDirectory();
  const p = {
    format: MAC_PROFILE_FORMAT,
    version: 1,
    project: project || env.PMRZ_INSTALL_ROOT,
    nodePath,
    data,
    host: env.PMRZ_HOST || previous?.host || "127.0.0.1",
    port: Number(env.PMRZ_PORT || previous?.port || 4310),
    update: updateConfig({
      PMRZ_UPDATE_REPOSITORY:
        env.PMRZ_UPDATE_REPOSITORY || previous?.update.repository,
      PMRZ_UPDATE_BRANCH: env.PMRZ_UPDATE_BRANCH || previous?.update.branch,
      PMRZ_UPDATE_CHECK_HOURS:
        env.PMRZ_UPDATE_CHECK_HOURS ||
        String(previous?.update.checkIntervalHours || 6),
      PMRZ_AUTO_UPDATE_CHECK:
        env.PMRZ_AUTO_UPDATE_CHECK ??
        (previous?.update.automatic === false ? "0" : "1"),
    }),
  };
  p.instanceId = instanceId(p.project, p.data);
  return validateMacProfile(p);
}
export function profileEnvironment(profile, base = process.env) {
  return {
    ...base,
    PATH: [
      dirname(profile.nodePath),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      base.PATH || "/usr/bin:/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].join(":"),
    PMRZ_DATA_DIR: profile.data,
    PMRZ_HOST: profile.host,
    PMRZ_PORT: String(profile.port),
    PMRZ_UPDATE_REPOSITORY: profile.update.repository,
    PMRZ_UPDATE_BRANCH: profile.update.branch,
    PMRZ_AUTO_UPDATE_CHECK: profile.update.automatic ? "1" : "0",
    PMRZ_UPDATE_CHECK_HOURS: String(profile.update.checkIntervalHours),
  };
}
