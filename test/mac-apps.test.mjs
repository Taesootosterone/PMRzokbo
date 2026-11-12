import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  readdirSync,
  symlinkSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import {
  macPaths,
  macApps,
  profileFromRuntime,
  profileEnvironment,
  readMacProfile,
  instanceId,
} from "../lib/mac-profile.mjs";
import {
  renderMacAppleScript,
  installMacApps,
  ensureMacApps,
} from "../lib/mac-launcher.mjs";
import { acquireControlLock, runMacAction } from "../scripts/mac-control.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pmrz-mac-")),
    home = join(root, "사용자 홈");
  mkdirSync(home);
  const profile = profileFromRuntime({
    project: process.cwd(),
    env: {
      PMRZ_DATA_DIR: join(root, "학습 데이터"),
      PMRZ_HOST: "0.0.0.0",
      PMRZ_PORT: "14349",
      PMRZ_AUTO_UPDATE_CHECK: "0",
    },
  });
  const paths = macPaths(home);
  const run = async (cmd, args) => {
    assert.equal(cmd, "/usr/bin/osacompile");
    mkdirSync(join(args[1], "Contents", "Resources"), { recursive: true });
    return { status: 0 };
  };
  return { root, home, profile, paths, run };
}
test("Mac profile preserves Node 24, custom data/port and Tailscale binding without credentials", () => {
  const f = fixture();
  try {
    const p = profileFromRuntime({
      project: process.cwd(),
      previous: f.profile,
      env: { GITHUB_TOKEN: "not-to-be-saved" },
    });
    assert.equal(p.host, "0.0.0.0");
    assert.equal(p.port, 14349);
    assert.equal(p.data, f.profile.data);
    assert.equal(p.nodePath, process.execPath);
    assert.equal(p.instanceId, instanceId(p.project, p.data));
    assert.ok(!JSON.stringify(p).includes("not-to-be-saved"));
    assert.equal(profileEnvironment(p, {}).PMRZ_HOST, "0.0.0.0");
    assert.match(profileEnvironment(p, {}).PATH, /bin/);
    assert.throws(
      () =>
        profileFromRuntime({
          project: "/tmp/PMRtest",
          env: { PMRZ_DATA_DIR: f.profile.data },
        }),
      /PMRtest/,
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test("Mac installer stages four owned apps, captures safe commands, repairs and rolls back compiler failure", async () => {
  const f = fixture();
  try {
    const apps = await installMacApps(f);
    assert.equal(apps.length, 4);
    assert.ok(apps.every((a) => a.installed));
    assert.equal(readMacProfile(f.paths.profile).host, "0.0.0.0");
    assert.equal(statSync(f.paths.profile).mode & 0o777, 0o600);
    const before = readFileSync(f.paths.profile);
    const marker = join(
      apps[0].path,
      "Contents/Resources/pmrzokbo-control-app.json",
    );
    const markerBefore = readFileSync(marker);
    assert.ok(
      readFileSync(join(apps[1].path, "Contents/Resources/applet.icns"))
        .subarray(0, 4)
        .equals(Buffer.from("icns")),
    );
    let compiled = 0;
    await ensureMacApps({
      ...f,
      run: async () => {
        compiled++;
        throw new Error("should not compile");
      },
    });
    assert.equal(compiled, 0);
    await assert.rejects(
      installMacApps({
        ...f,
        run: async (cmd, args) => {
          if (++compiled === 3) throw new Error("compile failed");
          return f.run(cmd, args);
        },
      }),
      /compile failed/,
    );
    assert.deepEqual(readFileSync(f.paths.profile), before);
    assert.deepEqual(readFileSync(marker), markerBefore);
    assert.ok(
      !readdirSync(f.paths.applications).some((s) =>
        s.startsWith(".pmrzokbo-apps-"),
      ),
    );
    const script = renderMacAppleScript(
      {
        ...f.profile,
        nodePath: "/tmp/한글 경로/node",
        project: "/tmp/a'$(touch no)-project",
      },
      { ...f.paths, runner: "/tmp/a'$(touch no)/control.mjs" },
      "update",
    );
    assert.match(script, /with timeout of 2400 seconds/);
    assert.match(script, /display dialog commandResult/);
    assert.ok(script.includes("'\\\\''"));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test("Mac installer preserves foreign apps, other installations and symlinked configuration", async () => {
  const f = fixture();
  try {
    const foreign = join(f.paths.applications, `${macApps[1].name}.app`);
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, "personal"), "keep");
    await assert.rejects(installMacApps(f), /소유/);
    assert.equal(readFileSync(join(foreign, "personal"), "utf8"), "keep");
    rmSync(foreign, { recursive: true });
    await installMacApps(f);
    const other = profileFromRuntime({
      project: process.cwd(),
      env: { PMRZ_DATA_DIR: join(f.root, "other") },
    });
    await assert.rejects(installMacApps({ ...f, profile: other }), /다른 리햅/);
    const target = join(f.root, "untouched");
    writeFileSync(target, "keep");
    rmSync(f.paths.runner);
    symlinkSync(target, f.paths.runner);
    await assert.rejects(ensureMacApps(f), /심볼릭/);
    assert.equal(readFileSync(target, "utf8"), "keep");
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test("Mac actions serialize, reject foreign server identity and never stop unrelated services", async () => {
  const f = fixture();
  let server;
  try {
    const unlock = acquireControlLock(f.paths.lock);
    assert.throws(() => acquireControlLock(f.paths.lock), /작업 중/);
    unlock();
    writeFileSync(
      f.paths.lock,
      JSON.stringify({ pid: 2147483647, nonce: "stale" }),
    );
    const release = acquireControlLock(f.paths.lock);
    release();
    assert.equal(existsSync(f.paths.lock), false);
    let mutations = 0;
    server = createServer((req, res) => {
      if (req.method === "POST") mutations++;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          app: "pmrzokbo",
          instanceId: "other-data",
          status: "ok",
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = { ...f.profile, port: server.address().port };
    writeFileSync(f.paths.profile, JSON.stringify(profile));
    for (const action of ["update", "stop", "open"])
      await assert.rejects(
        runMacAction(action, { profileFile: f.paths.profile }),
        /다른 서버/,
      );
    assert.equal(mutations, 0);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    rmSync(f.root, { recursive: true, force: true });
  }
});
