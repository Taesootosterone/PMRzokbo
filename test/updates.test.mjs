import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
  GitHubSource,
  inventory,
  safeSourcePath,
} from "../lib/update-source.mjs";
import { updateConfig, readJson, appInfo } from "../lib/update-state.mjs";
import { Updater } from "../lib/updater.mjs";
import { createUpdateFixture, git } from "./helpers/update-fixture.mjs";

test("updater accepts only the separate app, supported schema, and safe source paths", () => {
  assert.throws(
    () => updateConfig({ PMRZ_UPDATE_REPOSITORY: "Taesootosterone/PMRtest" }),
    /PMRtest/,
  );
  assert.throws(() =>
    updateConfig({ PMRZ_UPDATE_REPOSITORY: "https://evil.example/x" }),
  );
  assert.throws(() => updateConfig({ PMRZ_UPDATE_BRANCH: "../main" }));
  assert.equal(updateConfig({}).checkIntervalHours, 6);
  assert.throws(() => updateConfig({ PMRZ_UPDATE_CHECK_HOURS: "0" }));
  for (const path of [
    "../x",
    "a/../b",
    ".env.local",
    "DATA/bank.sqlite",
    "node_modules/a",
    "x/.git/config",
    "foo.pmrz",
    "a\\b",
  ])
    assert.equal(safeSourcePath(path), false, path);
  assert.equal(safeSourcePath("app/page.tsx"), true);
  assert.equal(safeSourcePath(".env.example"), true);
  const root = mkdtempSync(join(tmpdir(), "pmrz-paths-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "pmr-notes", version: "1.0.0" }),
    );
    assert.throws(() => appInfo(root));
    symlinkSync("/tmp", join(root, "link"));
    assert.throws(() => inventory(root), /심볼릭/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("real Git snapshot pins the checked commit; check/download does not execute code; tampered stage cannot apply", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-source-"));
  try {
    const { remote } = createUpdateFixture(root, process.cwd());
    const sha = git(remote, ["rev-parse", "HEAD"]);
    const source = new GitHubSource(updateConfig());
    source.url = remote;
    const data = join(root, "data");
    mkdirSync(data);
    let stopped = 0;
    const updater = new Updater({
      data,
      installRoot: process.cwd(),
      current: { kind: "baseline", sha: null, version: "1.1.0" },
      source,
      stopServer: () => {
        stopped++;
      },
      startServer: () => {},
      handoff: () => {},
      env: { PMRZ_AUTO_UPDATE_CHECK: "0" },
    });
    updater.check();
    const until = Date.now() + 10000;
    while (updater.busy && Date.now() < until) await delay(20);
    const status = updater.status();
    assert.equal(status.phase, "ready", status.error);
    assert.equal(status.candidate.sha, sha);
    const downloaded = join(updater.paths.downloads, sha);
    assert.equal(existsSync(join(downloaded, "node_modules")), false);
    assert.equal(existsSync(join(downloaded, ".next")), false);
    assert.equal(stopped, 0);
    writeFileSync(join(downloaded, "README.md"), "changed after download");
    updater.apply(sha);
    while (updater.busy) await delay(20);
    assert.equal(updater.status().phase, "error");
    assert.match(updater.status().error, /변경/);
    assert.equal(stopped, 0);
    assert.throws(() => updater.apply("a".repeat(40)), /다시 선택/);
    assert.equal(readJson(updater.paths.active), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("Git archives containing credentials or symlinks are rejected without installing", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-reject-"));
  try {
    const { remote } = createUpdateFixture(root, process.cwd());
    symlinkSync("/tmp", join(remote, "bad-link"));
    git(remote, ["add", "bad-link"]);
    git(remote, [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@localhost",
      "commit",
      "-m",
      "bad fixture",
    ]);
    const source = new GitHubSource(updateConfig());
    source.url = remote;
    const dir = join(root, "download");
    mkdirSync(dir);
    await assert.rejects(
      source.download(git(remote, ["rev-parse", "HEAD"]), dir),
      /심볼릭/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
