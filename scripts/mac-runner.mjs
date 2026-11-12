// PMRZokbo native control runner v1. Installed outside the code folder; contains no credentials.
import { readFileSync, existsSync, realpathSync, lstatSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

try {
  const [profileFile, action] = process.argv.slice(2);
  if (
    !isAbsolute(profileFile || "") ||
    !["open", "update", "stop", "status"].includes(action)
  )
    throw new Error("리햅 제어 앱의 설치 정보를 확인하세요.");
  const profile = JSON.parse(readFileSync(profileFile, "utf8"));
  if (
    profile?.format !== "pmrzokbo-mac-control" ||
    profile.version !== 1 ||
    !isAbsolute(profile.project || "") ||
    !isAbsolute(profile.data || "")
  )
    throw new Error("리햅 Mac 앱 설정 형식이 올바르지 않습니다.");
  let runtime = profile.project;
  const activeFile = join(profile.data, "updates", "active.json");
  if (existsSync(activeFile)) {
    const active = JSON.parse(readFileSync(activeFile, "utf8"));
    if (active.kind === "release") {
      if (!/^[a-f0-9]{40}$/.test(active.sha))
        throw new Error("실행 버전 정보가 올바르지 않습니다.");
      runtime = join(profile.data, "updates", "releases", active.sha);
      if (
        lstatSync(runtime).isSymbolicLink() ||
        realpathSync(runtime) !== resolve(runtime)
      )
        throw new Error("실행 폴더를 확인하세요.");
      if (
        JSON.parse(readFileSync(join(runtime, ".pmrz-ready.json"), "utf8"))
          .sha !== active.sha
      )
        throw new Error("설치가 완료되지 않은 버전입니다.");
    } else if (active.kind !== "baseline")
      throw new Error("실행 버전 형식을 확인하세요.");
  }
  const pkg = JSON.parse(readFileSync(join(runtime, "package.json"), "utf8"));
  const marker = JSON.parse(
    readFileSync(join(runtime, "pmrzokbo.json"), "utf8"),
  );
  if (
    pkg.name !== "pmrzokbo" ||
    marker.appId !== "pmrzokbo" ||
    marker.launcherProtocol !== 1
  )
    throw new Error("리햅 전용 프로그램이 아닙니다.");
  const control = join(runtime, "scripts", "mac-control.mjs");
  if (!existsSync(control))
    throw new Error(
      "Mac 제어 기능이 없는 버전입니다. 최신 리햅으로 업데이트한 뒤 Mac 앱을 다시 설치하세요.",
    );
  const module = await import(pathToFileURL(control).href);
  console.log(await module.runMacAction(action, { profileFile }));
} catch (error) {
  console.error(`리햅 관리 오류: ${error.message}`);
  process.exitCode = 1;
}
