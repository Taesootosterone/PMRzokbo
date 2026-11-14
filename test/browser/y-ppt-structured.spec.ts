import { test, expect } from "@playwright/test";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  createStructuredPptFixture,
  createPdfFixture,
} from "../helpers/ppt-fixture.mjs";
import { openPdf } from "../../lib/ppt-render.mjs";

test("repeated question headers and highlighted answers preserve late problem figures; disputes require manual answers", async ({
  page,
  request,
}, testInfo) => {
  const dir = join(process.env.PMRZ_E2E_DIR!, "structured-ppt-input");
  mkdirSync(dir, { recursive: true });
  const file = await createStructuredPptFixture(dir);
  const pdf = await createPdfFixture(file);
  const wrongPdf = await createPdfFixture(file, { pageCount: 11 });
  const before = (await (await request.get("/api/v1/overview")).json()).stats
    .total;
  await page.goto("/manage/ppt");
  await page.getByLabel("이미지 속 글자도 OCR로 읽기").uncheck();
  await page
    .getByLabel("PPTX 파일 업로드", { exact: true })
    .setInputFiles(file);
  const cards = page.locator(".ppt-candidate");
  await expect(cards).toHaveCount(2, { timeout: 90000 });
  await expect(
    page.getByText("PDF 자동 생성·저장 완료", { exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "PDF 다운로드", exact: true }).click();
  const downloaded = await downloading,
    path = testInfo.outputPath("auto-converted.pdf");
  await downloaded.saveAs(path);
  expect(await downloaded.failure()).toBeNull();
  const document = await openPdf(path);
  expect(document.pdf.numPages).toBe(12);
  await document.destroy();
  await page.screenshot({
    path: testInfo.outputPath("ppt-native-ready.png"),
    fullPage: true,
  });
  await expect(
    cards.nth(0).getByLabel("문제 슬라이드", { exact: true }),
  ).toHaveValue("1, 5, 6");
  await expect(
    cards.nth(0).getByLabel("정답·해설 슬라이드", { exact: true }),
  ).toHaveValue("2, 3, 4, 7");
  await expect(
    cards.nth(0).getByLabel("PPT 정답 번호", { exact: true }),
  ).toHaveValue("3");
  await expect(
    cards.nth(1).getByLabel("PPT 정답 번호", { exact: true }),
  ).toHaveValue("");
  await cards.nth(1).locator("details summary").click();
  await expect(
    cards.nth(1).getByText(/서로 다른 정답 또는 복원 이견/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "등록 가능한 문항 전체 선택", exact: true })
    .click();
  await expect(page.getByLabel("문항 1 선택", { exact: true })).toBeChecked();
  await expect(
    page.getByLabel("문항 2 선택", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel("선택한 문항의 슬라이드 묶음·정답·분류를 확인했습니다.", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("직접 만든 예시 파일이므로 데모 문항으로 표시", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "선택한 1문항 등록", exact: true })
    .click();
  await expect(
    page.locator(".ppt-current .backup-success[role=status]"),
  ).toContainText("1문항 등록");
  const jobs = await (await request.get("/api/v1/ppt-imports")).json();
  const jobId = jobs.jobs.find((j: { filename: string }) =>
    j.filename.includes("구조데모"),
  ).id;
  const job = await (await request.get(`/api/v1/ppt-imports/${jobId}`)).json();
  const qid = job.commitResult.questionIds[0];
  const q = await (await request.get(`/api/v1/questions/${qid}`)).json();
  expect(q.source.questionSlides).toEqual([1, 5, 6]);
  expect(q.source.explanationSlides).toEqual([2, 3, 4, 7]);
  expect(q.correctAnswer).toBe(3);
  await page.getByLabel("문항 1 선택", { exact: true }).uncheck();
  await cards
    .nth(1)
    .getByLabel("PPT 정답 번호", { exact: true })
    .selectOption("4");
  await page.getByLabel("문항 2 선택", { exact: true }).check();
  await page
    .getByLabel("선택한 문항의 슬라이드 묶음·정답·분류를 확인했습니다.", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "선택한 1문항 등록", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/v1/overview")).json()).stats.total,
    )
    .toBe(before + 2);
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
  // Upgrade an old job without a rendering-mode field. Retry must generate PDF,
  // retain registered questions, and never invoke the old Office converter.
  const legacyDir = join(
    process.env.PMRZ_E2E_DIR!,
    "primary",
    "ppt-imports",
    jobId,
  );
  const legacy = JSON.parse(readFileSync(join(legacyDir, "job.json"), "utf8"));
  delete legacy.renderMode;
  delete legacy.pdfFilename;
  delete legacy.pdfSha256;
  rmSync(join(legacyDir, "render-input.pdf"), { force: true });
  writeFileSync(join(legacyDir, "job.json"), JSON.stringify(legacy));
  expect(
    (
      await request.post(`/api/v1/ppt-imports/${jobId}/retry`, { data: {} })
    ).status(),
  ).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/v1/ppt-imports/${jobId}`)).json())
          .phase,
    )
    .toBe("ready");
  const regenerated = await (
    await request.get(`/api/v1/ppt-imports/${jobId}`)
  ).json();
  expect(regenerated.renderMode).toBe("native");
  expect(regenerated.pdfReady).toBe(true);
  const wrong = await request.post(`/api/v1/ppt-imports/${jobId}/pdf`, {
    headers: {
      "X-Pmrz-Filename": encodeURIComponent("wrong.pdf"),
      "Content-Type": "application/pdf",
    },
    data: readFileSync(wrongPdf),
  });
  expect(wrong.status()).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/v1/ppt-imports/${jobId}`)).json())
          .phase,
    )
    .toBe("error");
  expect(
    (await (await request.get(`/api/v1/ppt-imports/${jobId}`)).json()).error,
  ).toContain("PPT는 12장인데 PDF는 11페이지");
  await page.goto("/manage/ppt");
  await page
    .locator(".ppt-job-button")
    .filter({ hasText: "구조데모.pptx" })
    .click();
  await page
    .getByLabel("화면용 PDF 파일 업로드", { exact: true })
    .setInputFiles(pdf);
  await expect(cards).toHaveCount(2, { timeout: 30000 });
  await page
    .getByRole("button", { name: "보존한 PPT로 PDF 자동 생성", exact: true })
    .click();
  await expect(
    page.getByText("PDF 자동 생성·저장 완료", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  expect(
    (await (await request.get(`/api/v1/ppt-imports/${jobId}`)).json())
      .renderMode,
  ).toBe("native");
  expect(
    (await (await request.get("/api/v1/overview")).json()).stats.total,
  ).toBe(before + 2);
  expect(
    existsSync(join(process.env.PMRZ_E2E_DIR!, "office-was-invoked")),
  ).toBe(false);
});
