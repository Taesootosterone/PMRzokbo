import { test, expect } from "@playwright/test";

test("설정 백업의 진행 표시·오류 안내·재시도와 빈 데이터 다운로드", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const settingsButton = page.getByRole("button", {
    name: "설정",
    exact: true,
  });
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "설정", exact: true });
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/v1/backup", async (route) => {
    requests++;
    await pending;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: "테스트용 백업 실패입니다. 다시 시도하세요.",
      }),
    });
  });
  try {
    const button = settings.locator(".backup-download-button");
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toHaveText("백업 파일 만드는 중…");
    await expect(
      settings.getByRole("button", { name: "설정 닫기" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(settings).toBeVisible();
    expect(requests).toBe(1);
    release();
    await expect(settings.getByRole("alert")).toHaveText(
      "테스트용 백업 실패입니다. 다시 시도하세요.",
    );
    await expect(button).toBeEnabled();
    await expect(settings.getByRole("status")).toHaveCount(0);
    await page.unroute("**/api/v1/backup");
    const downloaded = page.waitForEvent("download");
    await button.click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.pmrz$/);
    expect(await download.failure()).toBeNull();
    await expect(settings.getByRole("alert")).toHaveCount(0);
    await expect(settings.getByRole("status")).toContainText(
      "백업 파일을 다운로드로 보냈습니다.",
    );
    const denied = await request.post("/api/v1/backup", {
      headers: { Origin: "https://unrelated.example" },
    });
    expect(denied.status()).toBe(403);
    const noGetBackup = await request.get("/api/v1/backup");
    expect(noGetBackup.status()).toBe(404);
    await settings
      .getByRole("button", { name: "설정 닫기", exact: true })
      .click();
    await expect(settingsButton).toBeFocused();
  } finally {
    release();
  }
});
