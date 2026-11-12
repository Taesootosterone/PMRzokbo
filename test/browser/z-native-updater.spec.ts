import { test, expect } from "@playwright/test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { profileFromRuntime, macPaths } from "../../lib/mac-profile.mjs";
import { runMacAction } from "../../scripts/mac-control.mjs";
import { publishFixture } from "../helpers/update-fixture.mjs";

test("Mac controller: detached startup → real update → stable external runner → stop/reopen with preserved data and binding", async () => {
  test.setTimeout(180000);
  const root = process.env.PMRZ_E2E_DIR!,
    home = join(root, "native-home"),
    project = join(root, "native-original"),
    data = join(root, "native-data"),
    paths = macPaths(home),
    base = "http://127.0.0.1:14314";
  mkdirSync(project, { recursive: true });
  mkdirSync(paths.config, { recursive: true });
  for (const name of [
    "lib",
    "scripts",
    "package.json",
    "package-lock.json",
    "pmrzokbo.json",
    "next.config.ts",
  ])
    cpSync(name, join(project, name), { recursive: true });
  // The stable original launcher is unchanged. A legacy original install need not contain mac-control.mjs.
  const { unlinkSync } = await import("node:fs");
  unlinkSync(join(project, "scripts/mac-control.mjs"));
  symlinkSync(
    join(process.cwd(), "node_modules"),
    join(project, "node_modules"),
    "dir",
  );
  symlinkSync(join(process.cwd(), ".next"), join(project, ".next"), "dir");
  const profile = profileFromRuntime({
    project,
    env: {
      ...process.env,
      PMRZ_DATA_DIR: data,
      PMRZ_HOST: "0.0.0.0",
      PMRZ_PORT: "14314",
      PMRZ_AUTO_UPDATE_CHECK: "0",
    },
  });
  writeFileSync(paths.profile, JSON.stringify(profile), { mode: 0o600 });
  cpSync("scripts/mac-runner.mjs", paths.runner);
  const options = { profileFile: paths.profile, pollMs: 200 };
  let opened = "";
  const savedPath = process.env.PATH;
  const gitCount = Number(process.env.GIT_CONFIG_COUNT || 0),
    gitKey = `GIT_CONFIG_KEY_${gitCount}`,
    gitValue = `GIT_CONFIG_VALUE_${gitCount}`,
    savedGit = {
      count: process.env.GIT_CONFIG_COUNT,
      key: process.env[gitKey],
      value: process.env[gitValue],
    };
  process.env.GIT_CONFIG_COUNT = String(gitCount + 1);
  process.env[gitKey] =
    `url.${pathToFileURL(join(root, "github-fixture")).href}.insteadOf`;
  process.env[gitValue] = "https://github.com/Taesootosterone/PMRzokbo.git";
  process.env.PATH = `${join(root, "git-bin")}:${savedPath}`;
  try {
    expect(
      await runMacAction("open", {
        ...options,
        openBrowser: async (url: string) => {
          opened = url;
        },
      }),
    ).toContain("백그라운드");
    expect(opened).toBe(`${base}/`);
    await fetch(`${base}/api/v1/demo`, { method: "POST" });
    const content = async () => {
      const { exportedAt, ...value } = await (
        await fetch(`${base}/api/v1/export`)
      ).json();
      return value;
    };
    const before = await content();
    const overview = await (await fetch(`${base}/api/v1/overview`)).json();
    const sha = publishFixture(join(root, "github-fixture"), "1.2.1");
    expect(await runMacAction("update", options)).toContain(
      "업데이트를 마쳤습니다",
    );
    const health = await (await fetch(`${base}/api/v1/health`)).json();
    expect(health.commit).toBe(sha);
    expect(health.instanceId).toBe(profile.instanceId);
    expect(await content()).toEqual(before);
    expect(
      (await (await fetch(`${base}/api/v1/overview`)).json()).stats,
    ).toEqual(overview.stats);
    expect(
      readdirSync(join(data, "updates/backups")).some((name) =>
        name.endsWith(".pmrz"),
      ),
    ).toBe(true);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [paths.runner, paths.profile, "status"],
      { env: process.env },
    );
    expect(stdout).toContain("v1.2.1 실행 중");
    expect(await runMacAction("update", options)).toContain("이미 최신 버전");
    expect(await runMacAction("stop", options)).toContain("중지했습니다");
    await expect
      .poll(() => existsSync(join(data, ".launcher.lock")))
      .toBe(false);
    expect(await runMacAction("status", options)).toContain("중지되어");
    await runMacAction("open", { ...options, openBrowser: async () => {} });
    expect((await (await fetch(`${base}/api/v1/health`)).json()).commit).toBe(
      sha,
    );
    expect(await content()).toEqual(before);
    expect(readFileSync(paths.profile, "utf8")).toContain("0.0.0.0");
  } finally {
    try {
      await runMacAction("stop", options);
    } finally {
      process.env.PATH = savedPath;
      for (const [key, value] of [
        ["GIT_CONFIG_COUNT", savedGit.count],
        [gitKey, savedGit.key],
        [gitValue, savedGit.value],
      ]) {
        if (value === undefined) delete process.env[key!];
        else process.env[key!] = value;
      }
    }
  }
});
