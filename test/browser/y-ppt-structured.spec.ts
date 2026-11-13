import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createStructuredPptFixture } from "../helpers/ppt-fixture.mjs";

test("repeated question headers and highlighted answers preserve late problem figures; disputes require manual answers", async ({
  page,
  request,
}) => {
  const dir = join(process.env.PMRZ_E2E_DIR!, "structured-ppt-input");
  mkdirSync(dir, { recursive: true });
  const file = await createStructuredPptFixture(dir);
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
  await expect(page.locator(".ppt-current .backup-success")).toContainText(
    "1문항 등록",
  );
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
});
