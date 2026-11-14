import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { mkdirSync, statSync, existsSync } from "node:fs";
import { createPptFixture, createPdfFixture } from "../helpers/ppt-fixture.mjs";

test("33MB PPTX: variable groups + local image OCR → review/edit → import/play → reopen/idempotency → delete draft preserves bank", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(300000);
  const root = join(process.env.PMRZ_E2E_DIR!, "ppt-input");
  mkdirSync(root, { recursive: true });
  const file = await createPptFixture(root, { large: true });
  const pdf = await createPdfFixture(file);
  expect(statSync(file).size).toBeGreaterThan(32 * 1024 * 1024);
  const before = await (await request.get("/api/v1/overview")).json();
  await page.goto("/manage");
  await page
    .getByRole("link", { name: "PPTX 자동 가져오기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "PPTX 자동 가져오기", exact: false }),
  ).toBeVisible();
  await page.getByText("다른 가져오기 방식", { exact: true }).click();
  await page
    .getByLabel("화면 가져오기 방식", { exact: true })
    .selectOption("pdf");
  await page
    .getByLabel("PPTX 파일 업로드", { exact: true })
    .setInputFiles(file);
  await expect(
    page.getByRole("heading", {
      name: "같은 PPT에서 저장한 PDF로 계속하기",
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
  // The waiting state and original survive closing/reopening the page.
  await page.reload();
  await page
    .locator(".ppt-job-button")
    .filter({ hasText: "2023_전문의_1차_1교시_데모.pptx" })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("ppt-pdf-upload.png"),
    fullPage: true,
  });
  await page
    .getByLabel("화면용 PDF 파일 업로드", { exact: true })
    .setInputFiles(pdf);
  await expect(page.locator(".ppt-candidate")).toHaveCount(2, {
    timeout: 150000,
  });
  const listing = await (await request.get("/api/v1/ppt-imports")).json(),
    id = listing.jobs[0].id;
  const job = await (await request.get(`/api/v1/ppt-imports/${id}`)).json();
  expect(job.phase).toBe("ready");
  expect(job.ocrCount).toBeGreaterThanOrEqual(2);
  expect(job.candidates[0].questionSlides).toEqual([2, 3]);
  expect(job.candidates[0].explanationSlides).toEqual([4, 5]);
  expect(job.candidates[1].correctAnswer).toBe(2);
  const cards = page.locator(".ppt-candidate");
  await expect(
    cards.nth(0).getByLabel("PPT 정답 번호", { exact: true }),
  ).toHaveValue("3");
  await expect(
    cards.nth(1).getByLabel("PPT 정답 번호", { exact: true }),
  ).toHaveValue("2");
  await page.locator(".ppt-grouping summary").click();
  await page.getByLabel("PPT 묶음 방식").selectOption("manual");
  await page.getByLabel("문항 시작 슬라이드", { exact: true }).fill("2,6");
  await page
    .getByRole("button", { name: "이 설정으로 묶음 다시 만들기", exact: true })
    .click();
  await expect(cards).toHaveCount(2);
  await cards
    .nth(0)
    .getByLabel("문항 제목", { exact: true })
    .fill("PPT에서 가져온 이미지 데모");
  await cards
    .nth(0)
    .getByLabel("관련 개념 · 쉼표로 구분", { exact: true })
    .fill("신경인성 방광, 척수손상");
  await page
    .getByRole("button", { name: "검토 초안 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "검토 초안 저장", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "검토 초안을 서버에 저장했습니다. 다음에도 이어서 검토할 수 있습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await page
    .locator(".ppt-job-button")
    .filter({ hasText: job.filename })
    .click();
  await expect(
    cards.nth(0).getByLabel("문항 제목", { exact: true }),
  ).toHaveValue("PPT에서 가져온 이미지 데모");
  await page
    .getByRole("button", { name: "등록 가능한 문항 전체 선택", exact: true })
    .click();
  await page
    .getByLabel("선택한 문항의 슬라이드 묶음·정답·분류를 확인했습니다.", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("직접 만든 예시 파일이므로 데모 문항으로 표시", { exact: true })
    .check();
  await page.screenshot({
    path: testInfo.outputPath("ppt-review-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "선택한 2문항 등록", exact: true })
    .click();
  await expect(
    page.locator(".ppt-current .backup-success[role=status]"),
  ).toContainText("2문항 등록", { timeout: 30000 });
  const detail = await (await request.get(`/api/v1/ppt-imports/${id}`)).json(),
    qid = detail.commitResult.questionIds[0],
    q = await (await request.get(`/api/v1/questions/${qid}`)).json();
  expect(q.title).toBe("PPT에서 가져온 이미지 데모");
  expect(q.isDemo).toBe(true);
  expect(q.explanation).toContain(
    "발표자노트: 가져온 해설에서도 보존되는 테스트 문장입니다.",
  );
  expect(q.source.questionSlides).toEqual([2, 3]);
  expect(q.conceptIds.length).toBeGreaterThanOrEqual(2);
  expect(
    (await (await request.get("/api/v1/overview")).json()).stats.total,
  ).toBe(before.stats.total + 2);
  await page.reload();
  await page
    .locator(".ppt-job-button")
    .filter({ hasText: detail.filename })
    .click();
  await expect(
    page.locator(".ppt-current .backup-success[role=status]"),
  ).toContainText("2문항 등록");
  await page
    .getByRole("button", { name: "등록 가능한 문항 전체 선택", exact: true })
    .click();
  await page
    .getByLabel("선택한 문항의 슬라이드 묶음·정답·분류를 확인했습니다.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "선택한 2문항 등록", exact: true })
    .click();
  await expect(
    page.locator(".ppt-current .backup-success[role=status]"),
  ).toContainText("기존 동일 문항 2개 유지");
  expect(
    (await (await request.get("/api/v1/overview")).json()).stats.total,
  ).toBe(before.stats.total + 2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("ppt-review-mobile.png"),
    fullPage: true,
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "분석 파일 삭제", exact: true })
    .click();
  await expect(page.locator(".ppt-current")).toHaveCount(0);
  expect(
    (await request.get(`/api/v1/images/${q.questionImage}`)).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/questions/${qid}`);
  await page
    .getByRole("button", { name: "이 문제 풀기", exact: false })
    .click();
  await page.getByRole("button", { name: "3번 답 선택", exact: true }).click();
  await page
    .getByRole("button", { name: "답 제출하고 해설 보기", exact: false })
    .click();
  await expect(page.getByText("정답입니다.", { exact: true })).toBeVisible();
  await expect(
    page.getByAltText("정답·해설 이미지", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("ppt-imported-solver.png"),
    fullPage: true,
  });
  const denied = await request.post("/api/v1/ppt-imports", {
    headers: { Origin: "https://unrelated.example" },
    data: "not a ppt",
  });
  expect(denied.status()).toBe(403);
  expect(
    existsSync(join(process.env.PMRZ_E2E_DIR!, "office-was-invoked")),
  ).toBe(false);
});
