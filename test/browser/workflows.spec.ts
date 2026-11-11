import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { restoreBackup } from "../../lib/backup.mjs";

test("이미지 등록·오답 복습·시험 재개·개념 연결·별도 환경 복원", async ({
  page,
  context,
  request,
}, testInfo) => {
  const root = process.env.PMRZ_E2E_DIR!;
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  context.on("page", (p) => p.on("pageerror", (e) => failures.push(e.message)));
  let qid = "",
    cid = "",
    sessionId = "",
    questionImage = "",
    explanationImage = "";
  const image = (text: string) =>
    sharp(
      Buffer.from(
        `<svg width="720" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="360" fill="#f5f8f4"/><rect x="30" y="25" width="660" height="310" rx="12" fill="white" stroke="#b4ccba"/><text x="55" y="80" font-size="23" fill="#35634d" font-family="sans-serif">DEMO IMAGE · NOT AN EXAM QUESTION</text><text x="55" y="145" font-size="22" fill="#506555" font-family="sans-serif">${text}</text><text x="55" y="225" font-size="19" fill="#718473" font-family="sans-serif">1. A    2. B    3. C    4. D    5. E</text></svg>`,
      ),
    )
      .png()
      .toBuffer();
  const png = await image("Question: choose option C."),
    explanation = await image("Explanation: correct answer is C (3).");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const saveDone = async (p: Page) =>
    expect(p.getByText("서버에 저장 완료", { exact: true })).toBeVisible();
  await test.step("① 이미지 한 쌍 수동 등록 → 오답 선택 → 해설 확인, 별표·메모·고정 링크", async () => {
    await page.goto("/manage");
    await page.getByRole("button", { name: "개념 추가", exact: true }).click();
    await page
      .getByLabel("개념 이름", { exact: true })
      .fill("브라우저 검증 개념");
    await page
      .getByLabel("NOAH 노트 ID (선택)")
      .fill("20000000-0000-4000-8000-000000000099");
    await page
      .getByLabel("외부 노트 열기 URL (선택)")
      .fill(
        "http://127.0.0.1:14310/noah-demo#note/20000000-0000-4000-8000-000000000099",
      );
    await page.getByRole("button", { name: "개념 저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    cid = (await (await request.get("/api/v1/concepts")).json())[0].id;
    await page
      .getByRole("button", { name: "새 문항 등록", exact: true })
      .click();
    await page
      .getByLabel("문항 제목", { exact: true })
      .fill("브라우저 데모 이미지 문항");
    await page.getByLabel("대단원", { exact: true }).fill("척수");
    await page.getByLabel("소단원", { exact: true }).fill("신경인성 방광");
    await page.getByLabel("시험 종류", { exact: true }).fill("직접 만든 데모");
    await page.getByLabel("연도", { exact: true }).fill("2022");
    await page.getByLabel("원래 문제번호", { exact: true }).fill("35");
    await page.getByLabel("문제 이미지 업로드", { exact: true }).setInputFiles({
      name: "question.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByAltText("등록할 문제")).toBeVisible();
    await page.getByLabel("해설 이미지 업로드", { exact: true }).setInputFiles({
      name: "explanation.png",
      mimeType: "image/png",
      buffer: explanation,
    });
    await expect(page.getByAltText("등록할 해설")).toBeVisible();
    await page.getByRole("button", { name: "정답 3번", exact: true }).click();
    await page.getByLabel("직접 만든 예시 — ‘데모 문항’으로 표시").check();
    await page.getByLabel("브라우저 검증 개념", { exact: true }).check();
    await page.getByRole("button", { name: "문항 저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const questions = await (await request.get("/api/v1/questions")).json();
    qid = questions[0].id;
    questionImage = questions[0].questionImage;
    const detail = await (await request.get(`/api/v1/questions/${qid}`)).json();
    explanationImage = detail.explanationImage;
    await page.goto("/");
    await page
      .getByRole("button", { name: "신경인성 방광", exact: false })
      .click();
    await expect(
      page.getByRole("img", { name: "문제 이미지", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "정답·해설 이미지", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "문제 이미지 확대", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "문제 이미지 확대 보기" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "확대 이미지 닫기" }).click();
    await page
      .getByRole("button", { name: "2번 답 선택", exact: true })
      .click();
    await saveDone(page);
    await page
      .getByRole("button", { name: "답 제출하고 해설 보기", exact: true })
      .click();
    await expect(
      page.getByText("다시 확인해보세요.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "정답·해설 이미지", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "별표", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "별표", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("textbox", { name: "나의 메모", exact: true })
      .fill("방광 평가 복습 메모");
    await page.getByRole("button", { name: "메모 저장", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "메모를 저장했습니다." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "고정 링크 복사" }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(`/questions/${qid}`);
  });
  await test.step("② 최근 오답에서 재풀이 정답 → 목록 제외, 두 시도 유지", async () => {
    await page.goto("/notebook");
    await expect(
      page
        .getByRole("link", { name: "브라우저 데모 이미지 문항", exact: false })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "현재 목록 다시 풀기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "3번 답 선택", exact: true })
      .click();
    await saveDone(page);
    await page
      .getByRole("button", { name: "답 제출하고 해설 보기", exact: true })
      .click();
    await expect(page.getByText("정답입니다.", { exact: true })).toBeVisible();
    await page.goto("/notebook");
    await expect(
      page.getByText("현재 최근 오답이 없습니다.", { exact: true }),
    ).toBeVisible();
    const h = await (
      await request.get(`/api/v1/questions/${qid}/history`)
    ).json();
    expect(h).toHaveLength(2);
    expect(h.map((a: { correct: boolean }) => a.correct)).toEqual([
      true,
      false,
    ]);
    await page.goto(`/questions/${qid}`);
    await expect(
      page.getByRole("heading", { name: "모든 풀이 기록 2회" }),
    ).toBeVisible();
  });
  await test.step("④ 두 문항·하나의 개념 연결, 관련 문항 API와 데모 외부 노트 열기", async () => {
    await page.goto("/manage");
    await page
      .getByRole("button", { name: "새 문항 등록", exact: true })
      .click();
    await page
      .getByRole("button", { name: "지문·선지 직접 입력", exact: true })
      .click();
    await page
      .getByLabel("문항 제목", { exact: true })
      .fill("브라우저 데모 텍스트 문항");
    await page.getByLabel("대단원", { exact: true }).fill("척수");
    await page.getByLabel("소단원", { exact: true }).fill("신경인성 방광");
    await page.getByLabel("시험 종류", { exact: true }).fill("직접 만든 데모");
    await page.getByLabel("원래 문제번호", { exact: true }).fill("36");
    await page
      .getByLabel("문제 지문", { exact: true })
      .fill("이 문항은 브라우저 검증용 데모입니다. 1번을 선택하세요.");
    for (let i = 1; i <= 5; i++)
      await page
        .getByRole("textbox", { name: `${i}번 선지`, exact: true })
        .fill(`데모 선지 ${i}`);
    await page
      .getByLabel("해설 텍스트", { exact: false })
      .fill("직접 작성한 검증용 데모 해설입니다.");
    await page.getByLabel("브라우저 검증 개념", { exact: true }).check();
    await page.getByLabel("직접 만든 예시 — ‘데모 문항’으로 표시").check();
    await page.getByRole("button", { name: "문항 저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(`/concepts/${cid}`);
    await expect(page.locator(".question-row")).toHaveCount(2);
    const related = await (
      await request.get(`/api/v1/concepts/${cid}/questions`)
    ).json();
    expect(related.apiVersion).toBe(1);
    expect(related.questions).toHaveLength(2);
    expect(related.questions[0].path).toContain("/questions/");
    await context.route("**/noah-demo", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<html lang="ko"><meta charset="utf-8"><body><h1>NOAH 외부 노트 연결 데모</h1><p>실제 NOAH 서버가 아닌 브라우저 테스트 페이지입니다.</p></body></html>',
      }),
    );
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("link", { name: "외부 노트 열기", exact: true })
      .click();
    const popup = await popupPromise;
    await expect(
      popup.getByRole("heading", { name: "NOAH 외부 노트 연결 데모" }),
    ).toBeVisible();
    expect(popup.url()).toContain("#note/20000000-0000-4000-8000-000000000099");
    await popup.close();
  });
  await test.step("③ 시험 도중 창 닫기 → 재접속 → 답 수정 → 최종 채점", async () => {
    await page.goto("/create");
    await expect(page.locator(".summary-count")).toHaveText("2문항");
    await page.getByRole("button", { name: "시험 모드", exact: false }).click();
    await page.getByLabel("풀 문항 수", { exact: true }).fill("2");
    await page
      .getByLabel("문항 순서", { exact: true })
      .selectOption("original");
    await page
      .getByRole("button", { name: "학습 시작하기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "나만의 맞춤 시험." }),
    ).toBeVisible();
    sessionId = page.url().split("/").pop()!;
    await page
      .getByRole("button", { name: "2번 답 선택", exact: true })
      .click();
    await saveDone(page);
    await page.getByRole("button", { name: "다음 문항", exact: true }).click();
    await saveDone(page);
    await expect(
      page.getByRole("button", { name: "정답·해설 이미지 확대", exact: true }),
    ).toHaveCount(0);
    const hidden = await (
      await request.get(`/api/v1/sessions/${sessionId}`)
    ).json();
    expect(hidden.questions[0].correctAnswer).toBeUndefined();
    expect(hidden.questions[0].explanationImage).toBeUndefined();
    expect(hidden.index).toBe(1);
    await page.close();
    page = await context.newPage();
    await page.goto(`/sessions/${sessionId}`);
    await expect(page.locator(".question-position")).toHaveText(
      /문항\s*02\s*\/\s*02/,
    );
    await page.getByRole("button", { name: "이전 문항", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "2번 답 선택", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "3번 답 선택", exact: true })
      .click();
    await saveDone(page);
    await page.getByRole("button", { name: "다음 문항", exact: true }).click();
    await saveDone(page);
    await page
      .getByRole("button", { name: "1번 답 선택", exact: true })
      .click();
    await saveDone(page);
    await page
      .getByRole("button", { name: "시험 최종 제출", exact: true })
      .click();
    await page
      .getByRole("button", { name: "최종 제출하고 채점", exact: true })
      .click();
    await expect(page.locator(".result-score")).toHaveText("2 / 2 정답");
    await page.getByRole("button", { name: "이전 문항", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "정답·해설 이미지", exact: true }),
    ).toBeVisible();
  });
  await test.step("JSON 내보내기·중복 가져오기와 수동 수정, 출처 검색", async () => {
    const exportData = await (await request.get("/api/v1/export")).json();
    expect(exportData.assets).toHaveLength(2);
    await page.goto("/manage");
    await page.getByLabel("JSON 파일 가져오기").setInputFiles({
      name: "content.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exportData)),
    });
    await expect(
      page.getByRole("status").filter({ hasText: "기존 문항 2개 유지" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "문항 검색", exact: true })
      .fill("2022년 직접 만든 데모 35번");
    await expect(page.locator(".question-row")).toHaveCount(1);
    await page.getByRole("button", { name: "수정", exact: true }).click();
    await page
      .getByLabel("문항 제목", { exact: true })
      .fill("브라우저 데모 이미지 문항 (수정)");
    await page.getByRole("button", { name: "문항 저장", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto(`/questions/${qid}`);
    await expect(
      page.getByRole("heading", {
        name: "브라우저 데모 이미지 문항 (수정)",
        exact: true,
      }),
    ).toBeVisible();
    const rejected = await request.post("/api/v1/questions", {
      data: {},
      headers: { Origin: "https://unrelated.example" },
    });
    expect(rejected.status()).toBe(403);
  });
  await test.step("⑤ 설정 톱니바퀴에서 전체 백업 다운로드 → 별도 서버에서 복원 확인", async () => {
    const file = join(root, "full.pmrz"),
      restored = join(root, "restored");
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "설정", exact: true });
    await expect(
      settings.getByText("문항과 문제·해설 이미지", { exact: true }),
    ).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await settings
      .getByRole("button", { name: "전체 백업 다운로드", exact: true })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(
      /^pmrzokbo-backup-.*-KST-.*\.pmrz$/,
    );
    await download.saveAs(file);
    expect(await download.failure()).toBeNull();
    const payload = JSON.parse(readFileSync(file, "utf8"));
    expect(payload.format).toBe("pmrzokbo-full-backup");
    expect(payload.version).toBe(1);
    expect(payload.files).toHaveLength(3);
    await expect(settings.getByRole("status")).toContainText(
      "백업 파일을 다운로드로 보냈습니다.",
    );
    await page.screenshot({
      path: testInfo.outputPath("settings-backup-desktop.png"),
      fullPage: true,
    });
    await settings
      .getByRole("button", { name: "설정 닫기", exact: true })
      .click();
    const result = restoreBackup(file, restored);
    expect(result.files).toBe(3);
    const child = spawn(process.execPath, ["scripts/serve.mjs", "start"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PMRZ_DATA_DIR: restored,
        PMRZ_PORT: "14311",
        PMRZ_HOST: "127.0.0.1",
      },
      stdio: "pipe",
    });
    let logs = "";
    child.stdout?.on("data", (d) => (logs += d));
    child.stderr?.on("data", (d) => (logs += d));
    try {
      await expect
        .poll(
          async () => {
            try {
              return (await fetch("http://127.0.0.1:14311/api/v1/health")).ok;
            } catch {
              return false;
            }
          },
          { timeout: 30000 },
        )
        .toBe(true);
      const restoredQuestions = await (
        await fetch("http://127.0.0.1:14311/api/v1/questions")
      ).json();
      expect(restoredQuestions).toHaveLength(2);
      const restoredQ = restoredQuestions.find(
        (q: { id: string }) => q.id === qid,
      );
      expect(restoredQ.starred).toBe(true);
      expect(restoredQ.memo).toBe("방광 평가 복습 메모");
      expect(restoredQ.conceptIds).toContain(cid);
      const originalHistory = await (
        await request.get(`/api/v1/questions/${qid}/history`)
      ).json();
      const restoredHistory = await (
        await fetch(`http://127.0.0.1:14311/api/v1/questions/${qid}/history`)
      ).json();
      expect(restoredHistory).toEqual(originalHistory);
      expect(
        Buffer.from(
          await (
            await fetch(`http://127.0.0.1:14311/api/v1/images/${questionImage}`)
          ).arrayBuffer(),
        ),
      ).toEqual(png);
      expect(
        Buffer.from(
          await (
            await fetch(
              `http://127.0.0.1:14311/api/v1/images/${explanationImage}`,
            )
          ).arrayBuffer(),
        ),
      ).toEqual(explanation);
      await page.goto(`http://127.0.0.1:14311/sessions/${sessionId}`);
      await expect(page.locator(".result-score")).toHaveText("2 / 2 정답");
      await expect(
        page.getByRole("img", { name: "문제 이미지", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("img", { name: "정답·해설 이미지", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "브라우저 검증 개념 같은 개념의 문제 보기",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("restore-desktop.png"),
        fullPage: true,
      });
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      await testInfo.attach("restore-server-log", {
        body: logs,
        contentType: "text/plain",
      });
    }
  });
  await test.step("iPad 가로·iPhone 세로 레이아웃과 실제 답 선택", async () => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto("/");
    await page.screenshot({
      path: testInfo.outputPath("ipad-landscape.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/create");
    await page
      .getByRole("button", { name: "학습 시작하기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "1번 답 선택", exact: true })
      .click();
    await saveDone(page);
    await page
      .getByRole("button", { name: "답 제출하고 해설 보기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "정답 해설", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("iphone-portrait.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "설정", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "설정", exact: true });
    await expect(
      settings.getByRole("button", { name: "전체 백업 다운로드", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("settings-backup-mobile.png"),
      fullPage: true,
    });
    await settings
      .getByRole("tab", { name: "앱 업데이트", exact: true })
      .click();
    await expect(
      settings.getByRole("button", {
        name: "업데이트 확인·다운로드",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("settings-updates-mobile.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "설정", exact: true }),
    ).toBeFocused();
  });
  expect(failures).toEqual([]);
});
