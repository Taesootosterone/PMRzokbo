import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { publishFixture } from "../helpers/update-fixture.mjs";
import { spawn } from "node:child_process";

test("설정 버튼으로 실제 Git 다운로드·버전 적용·재시작·빌드 실패 보존·실행 실패 롤백", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(480000);
  const root = process.env.PMRZ_E2E_DIR!,
    remote = join(root, "github-fixture");
  if (!(await (await request.get("/api/v1/questions")).json()).length)
    await request.post("/api/v1/demo", { data: {} });
  const before = await (await request.get("/api/v1/export")).json(),
    overview = await (await request.get("/api/v1/overview")).json();
  const packageBefore = readFileSync("package.json");
  const sha = publishFixture(remote, "1.3.2");
  // A separate real server must download automatically without applying or running the new code.
  const automaticData = join(root, "automatic-data");
  const automatic = spawn(process.execPath, ["scripts/serve.mjs", "start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PMRZ_DATA_DIR: automaticData,
      PMRZ_PORT: "14312",
      PMRZ_HOST: "127.0.0.1",
      PMRZ_AUTO_UPDATE_CHECK: "1",
      PATH: `${join(root, "git-bin")}:${process.env.PATH || ""}`,
    },
    stdio: "pipe",
  });
  let automaticLog = "";
  automatic.stdout?.on("data", (b) => (automaticLog += b));
  automatic.stderr?.on("data", (b) => (automaticLog += b));
  try {
    await expect
      .poll(
        async () => {
          try {
            return (
              await (
                await fetch("http://127.0.0.1:14312/api/v1/updates")
              ).json()
            ).phase;
          } catch {
            return "offline";
          }
        },
        { timeout: 30000 },
      )
      .toBe("ready");
    const health = await (
      await fetch("http://127.0.0.1:14312/api/v1/health")
    ).json();
    expect(health.commit).toBeNull();
    expect(health.version).toBe(JSON.parse(packageBefore.toString()).version);
    expect(
      existsSync(join(automaticData, "updates/downloads", sha, "node_modules")),
    ).toBe(false);
    expect(existsSync(join(automaticData, "updates/active.json"))).toBe(false);
  } finally {
    const exited = new Promise<void>((resolve) =>
      automatic.once("exit", () => resolve()),
    );
    automatic.kill("SIGTERM");
    await exited;
    await testInfo.attach("automatic-download-log", {
      body: automaticLog,
      contentType: "text/plain",
    });
  }
  await page.goto("/");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "설정", exact: true });
  await dialog.getByRole("tab", { name: "앱 업데이트", exact: true }).click();
  await dialog
    .getByRole("button", { name: "업데이트 확인·다운로드", exact: true })
    .click();
  await expect(dialog.locator(".update-phase")).toHaveAttribute(
    "data-phase",
    "ready",
    { timeout: 30000 },
  );
  await expect(dialog.locator(".update-candidate")).toContainText(
    sha.slice(0, 8),
  );
  expect(
    (await (await request.get("/api/v1/health")).json()).commit,
  ).toBeNull();
  expect(
    existsSync(join(root, "primary/updates/downloads", sha, "node_modules")),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("update-ready.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "업데이트 적용", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        try {
          return (await (await request.get("/api/v1/health")).json()).commit;
        } catch {
          return null;
        }
      },
      { timeout: 180000 },
    )
    .toBe(sha);
  await expect
    .poll(
      async () => {
        try {
          return (await (await request.get("/api/v1/updates")).json()).phase;
        } catch {
          return "offline";
        }
      },
      { timeout: 30000 },
    )
    .toBe("idle");
  await expect(
    page.getByRole("dialog", { name: "설정", exact: true }),
  ).toHaveCount(0, { timeout: 15000 });
  const after = await (await request.get("/api/v1/export")).json();
  expect(after.questions).toEqual(before.questions);
  expect(after.assets).toEqual(before.assets);
  expect(after.links).toEqual(before.links);
  expect((await (await request.get("/api/v1/overview")).json()).stats).toEqual(
    overview.stats,
  );
  expect(readFileSync("package.json")).toEqual(packageBefore);
  expect(
    readdirSync(join(root, "primary/updates/backups")).some((name) =>
      name.endsWith(".pmrz"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "설정", exact: true });
  await dialog.getByRole("tab", { name: "앱 업데이트", exact: true }).click();
  await expect(dialog.locator(".update-version")).toContainText("v1.3.2");
  await page.screenshot({
    path: testInfo.outputPath("update-applied.png"),
    fullPage: true,
  });

  publishFixture(remote, "1.3.3", { buildFailure: true });
  await dialog
    .getByRole("button", { name: "업데이트 확인·다운로드", exact: true })
    .click();
  await expect(dialog.locator(".update-phase")).toHaveAttribute(
    "data-phase",
    "ready",
    { timeout: 30000 },
  );
  await dialog
    .getByRole("button", { name: "업데이트 적용", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("빌드에 실패", {
    timeout: 60000,
  });
  expect((await (await request.get("/api/v1/health")).json()).commit).toBe(sha);
  await expect(dialog.getByRole("button", { name: "설정 닫기" })).toBeEnabled();

  publishFixture(remote, "1.3.4", { startFailure: true });
  await dialog
    .getByRole("button", { name: "업데이트 확인·다운로드", exact: true })
    .click();
  await expect(dialog.locator(".update-phase")).toHaveAttribute(
    "data-phase",
    "ready",
    { timeout: 30000 },
  );
  await dialog
    .getByRole("button", { name: "업데이트 적용", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        try {
          return (await (await request.get("/api/v1/updates")).json()).phase;
        } catch {
          return "offline";
        }
      },
      { timeout: 180000 },
    )
    .toBe("rolled-back");
  await expect(dialog.getByRole("alert")).toContainText("이전 코드로 복구", {
    timeout: 15000,
  });
  expect((await (await request.get("/api/v1/health")).json()).commit).toBe(sha);
  expect((await (await request.get("/api/v1/overview")).json()).stats).toEqual(
    overview.stats,
  );
  const denied = await request.post("/api/v1/updates/apply", {
    data: { sha },
    headers: { Origin: "https://unrelated.example" },
  });
  expect(denied.status()).toBe(403);
  await page.screenshot({
    path: testInfo.outputPath("update-rolled-back.png"),
    fullPage: true,
  });
});
