import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

export const shaPattern = /^[a-f0-9]{40}$/;
export const busyPhases = [
  "checking",
  "downloading",
  "installing",
  "backup",
  "restarting",
];
export function pathsFor(data) {
  const root = join(data, "updates");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return {
    root,
    state: join(root, "state.json"),
    active: join(root, "active.json"),
    pending: join(root, "pending.json"),
    downloads: join(root, "downloads"),
    releases: join(root, "releases"),
    backups: join(root, "backups"),
  };
}
export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}
export function writeJson(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temp, path);
}
export function saveState(paths, patch) {
  const state = {
    format: "pmrzokbo-updater",
    version: 1,
    phase: "idle",
    candidate: null,
    error: null,
    ...readJson(paths.state, {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeJson(paths.state, state);
  return state;
}
export function updateConfig(env = process.env) {
  const repository = env.PMRZ_UPDATE_REPOSITORY || "Taesootosterone/PMRzokbo";
  const branch = env.PMRZ_UPDATE_BRANCH || "main";
  const checkIntervalHours = Number(env.PMRZ_UPDATE_CHECK_HOURS || 6);
  if (
    !Number.isInteger(checkIntervalHours) ||
    checkIntervalHours < 1 ||
    checkIntervalHours > 168
  )
    throw new Error("자동 확인 간격은 1~168시간이어야 합니다.");
  if (
    !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    repository.split("/")[1].toLowerCase() === "pmrtest"
  )
    throw new Error(
      "문제은행 전용 GitHub 저장소를 설정하세요. PMRtest는 업데이트 원본으로 사용할 수 없습니다.",
    );
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,100}$/.test(branch) ||
    branch.includes("..") ||
    branch.endsWith("/") ||
    branch.endsWith(".lock")
  )
    throw new Error("업데이트 브랜치 이름을 확인하세요.");
  return {
    repository,
    branch,
    automatic: env.PMRZ_AUTO_UPDATE_CHECK !== "0",
    checkIntervalHours,
  };
}
export function appInfo(directory) {
  const pkg = readJson(join(directory, "package.json"));
  const marker = readJson(join(directory, "pmrzokbo.json"));
  if (
    pkg?.name !== "pmrzokbo" ||
    marker?.appId !== "pmrzokbo" ||
    marker.launcherProtocol !== 1 ||
    marker.dataSchema !== 1 ||
    !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(pkg.version)
  )
    throw new Error(
      "호환되는 PMRZokbo 앱이 아닙니다. 앱 식별자·실행 프로토콜·DB 버전을 확인하세요.",
    );
  if (
    !existsSync(join(directory, "package-lock.json")) ||
    !existsSync(join(directory, "scripts/supervisor.mjs"))
  )
    throw new Error("업데이트에 필요한 실행 파일 또는 잠금 파일이 없습니다.");
  return { version: pkg.version };
}
export function targetDirectory(target, installRoot, paths) {
  if (target?.kind === "baseline") return installRoot;
  if (target?.kind !== "release" || !shaPattern.test(target.sha))
    throw new Error("업데이트 버전 정보가 올바르지 않습니다.");
  const dir = join(paths.releases, target.sha);
  if (lstatSync(dir).isSymbolicLink() || realpathSync(dir) !== resolve(dir))
    throw new Error("업데이트 폴더가 올바르지 않습니다.");
  const ready = readJson(join(dir, ".pmrz-ready.json"));
  if (ready?.sha !== target.sha)
    throw new Error("설치가 완료되지 않은 버전입니다.");
  if (appInfo(dir).version !== target.version)
    throw new Error("설치 버전 정보가 일치하지 않습니다.");
  return dir;
}
export function assertSeparateData(installRoot, data) {
  const rel = relative(realpathSync(installRoot), realpathSync(data));
  if (!rel || (!rel.startsWith("..") && !isAbsolute(rel)))
    throw new Error(
      "자동 업데이트에는 코드 폴더 밖의 별도 데이터 경로가 필요합니다.",
    );
  if (installRoot.split(/[\\/]/).some((p) => p.toLowerCase() === "pmrtest"))
    throw new Error(
      "PMRtest 폴더에서는 이 앱을 실행할 수 없습니다. 별도 PMRzokbo 폴더를 사용하세요.",
    );
}
