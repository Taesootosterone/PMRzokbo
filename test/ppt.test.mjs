import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  detectAnswer,
  groupSlides,
  parseSlides,
  fileMetadata,
  classifyContent,
  importedId,
  questionNumber,
} from "../lib/ppt-model.mjs";
import { readPresentation } from "../lib/ppt-archive.mjs";
import {
  saveJob,
  jobDirectory,
  commitJob,
  deleteJob,
  saveReview,
  getJob,
  cancelJob,
} from "../lib/ppt-jobs.mjs";
import { Store } from "../lib/store.mjs";
import { createBackup, restoreBackup } from "../lib/backup.mjs";
import { createPptFixture } from "./helpers/ppt-fixture.mjs";
const slides = [
  "표지",
  "35. 척수손상 신경인성 방광 평가",
  "추가 그림과 표",
  "정답: ③",
  "해설 neurogenic bladder urodynamic",
  "36. 회전근개 rotator cuff shoulder",
  "Answer: 2",
].map((text, i) => ({
  number: i + 1,
  text,
  notes: i === 4 ? "발표자노트 보존 확인" : "",
}));
test("variable-length PPT questions keep all question/answer/explanation slides and infer filename metadata", () => {
  const meta = fileMetadata("2023_재활의학과_전문의_1차_1교시.pptx");
  assert.equal(meta.year, 2023);
  assert.equal(meta.examType, "전문의시험 1차 1교시");
  const result = groupSlides(slides, { mode: "auto" }, meta);
  assert.equal(questionNumber("35\n이어지는 문제 지문"), 35);
  assert.equal(questionNumber("① 첫 번째 선지"), null);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates[0].questionSlides, [2, 3]);
  assert.deepEqual(result.candidates[0].explanationSlides, [4, 5]);
  assert.equal(result.candidates[0].correctAnswer, 3);
  assert.equal(result.candidates[0].originalNumber, 35);
  assert.equal(result.candidates[0].major, "척수");
  assert.equal(result.candidates[0].minor, "신경인성 방광");
  assert.deepEqual(result.candidates[1].questionSlides, [6]);
  assert.equal(result.candidates[1].correctAnswer, 2);
  const repeated = [...slides];
  repeated[2] = { ...repeated[2], text: "35. 같은 문항의 이어지는 자료" };
  assert.equal(groupSlides(repeated).candidates.length, 2);
  assert.equal(classifyContent("아무 단서가 없는 데모").major, "미분류");
});
test("answers need explicit evidence; conflicting/multiple answers and choices are never guessed", () => {
  assert.equal(detectAnswer("① 첫 선지\n② 두 선지\n③ 세 선지").answer, null);
  assert.equal(detectAnswer("정답: ③").answer, 3);
  assert.equal(detectAnswer("Answer: B").answer, 2);
  assert.equal(detectAnswer("정답: (3)").answer, 3);
  assert.equal(detectAnswer("Answer: [B]").answer, 2);
  assert.equal(detectAnswer("정답:\n③").answer, 3);
  assert.equal(detectAnswer("Answer\n(B)").answer, 2);
  assert.equal(detectAnswer("정답: (①),(③)").answer, null);
  assert.equal(detectAnswer("오답: ①\n정답: ③").answer, 3);
  for (const text of ["정답: ③\n정답: ②", "정답: ①,③", "정답: 12"])
    assert.equal(detectAnswer(text).answer, null, text);
  assert.equal(
    detectAnswer("설명 중 표\n3\n다른 값", { standalone: true }).answer,
    null,
  );
  const only = [
    { number: 1, text: "1. 질문", notes: "" },
    { number: 2, text: "③", notes: "" },
    { number: 3, text: "해설입니다.", notes: "" },
  ];
  assert.equal(groupSlides(only).candidates[0].correctAnswer, 3);
  const unknown = groupSlides([
    { number: 1, text: "1. 질문" },
    { number: 2, text: "해설만 있고 정답은 지정하지 않았습니다." },
  ]).candidates[0];
  assert.equal(unknown.correctAnswer, null);
});
test("manual starts correct irregular boundaries; ranges reject malformed, overlapping and out-of-range input", () => {
  const result = groupSlides(
    slides,
    { mode: "manual", starts: "2,6" },
    fileMetadata("2023_데모.pptx"),
  );
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(parseSlides("2,3,5-7", 7), [2, 3, 5, 6, 7]);
  for (const input of ["0", "1-8", "../2", "3-2"])
    assert.throws(() => parseSlides(input, 7));
  assert.throws(() => groupSlides(slides, { mode: "manual", starts: "" }));
  assert.equal(
    groupSlides(slides, {
      mode: "fixed",
      startSlide: 2,
      questionPages: 1,
      answerPages: 1,
      explanationPages: 1,
    }).candidates.length,
    2,
  );
  assert.equal(
    groupSlides([{ number: 1, text: "이미지만 있고 문항 번호를 못 읽음" }])
      .warnings.length,
    1,
  );
});
test("PPTX parser follows the real presentation order, extracts text and rejects a non-archive", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-ppt-read-"));
  try {
    const file = await createPptFixture(root),
      actual = await readPresentation(file);
    assert.equal(actual.length, 7);
    assert.match(actual[1].text, /척수손상/);
    assert.match(actual[3].text, /정답/);
    assert.match(actual[4].notes, /발표자노트/);
    assert.equal(actual[5].text, "");
    const bad = join(root, "bad.pptx");
    writeFileSync(bad, "not a zip");
    await assert.rejects(readPresentation(bad), /PPTX/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("PPT commit preserves existing concepts, edits and personal records; repeat import is idempotent; backup includes imported source and images", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-ppt-commit-")),
    data = join(root, "data"),
    db = new Store(data),
    id = randomUUID(),
    dir = jobDirectory(data, id);
  mkdirSync(join(dir, "slides"), { recursive: true });
  try {
    const linked = db.saveConcept({
      name: "신경인성 방광",
      noahNoteId: "20000000-0000-4000-8000-000000000001",
      externalUrl:
        "http://127.0.0.1:3000/#note/20000000-0000-4000-8000-000000000001",
    });
    const png = await sharp({
      create: { width: 400, height: 225, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    for (let n = 1; n <= 7; n++)
      writeFileSync(join(dir, "slides", `${n}.png`), png);
    const grouped = groupSlides(slides, {}, fileMetadata("2023_전문의.pptx"));
    saveJob(dir, {
      id,
      filename: "데모.pptx",
      sha256: "a".repeat(64),
      phase: "ready",
      createdAt: new Date().toISOString(),
      slides,
      ...grouped,
    });
    await assert.rejects(
      commitJob(db, id, { reviewed: false, candidates: grouped.candidates }),
      /확인/,
    );
    assert.equal(db.stats().total, 0);
    saveReview(data, id, {
      candidates: grouped.candidates.map((c) => ({
        ...c,
        title: "저장한 검토 초안",
        qInput: c.questionSlides.join(","),
        eInput: c.explanationSlides.join(","),
        conceptInput: c.conceptNames.join(","),
        correctAnswer: null,
      })),
    });
    assert.equal(getJob(data, id).reviewDrafts[0].title, "저장한 검토 초안");
    assert.equal(getJob(data, id).reviewDrafts[0].correctAnswer, null);
    assert.equal(db.stats().total, 0);
    const invalid = structuredClone(grouped.candidates);
    invalid[1].correctAnswer = null;
    await assert.rejects(
      commitJob(db, id, { reviewed: true, candidates: invalid }),
      /정답/,
    );
    assert.equal(db.stats().total, 0);
    const first = await commitJob(db, id, {
      reviewed: true,
      isDemo: true,
      candidates: grouped.candidates,
    });
    assert.equal(first.added, 2);
    assert.equal(db.stats().total, 2);
    const qid = first.questionIds[0];
    assert.match(db.question(qid).explanation, /발표자노트 보존/);
    assert.equal(qid, importedId("a".repeat(64), [2, 3]));
    assert.ok(db.question(qid).conceptIds.includes(linked.id));
    assert.equal(db.concept(linked.id).externalUrl, linked.externalUrl);
    db.saveQuestion({ ...db.question(qid), title: "사용자가 바꾼 제목" });
    db.personal(qid, { starred: true, memo: "보존할 메모" });
    let s = db.createSession({ mode: "exam", questionIds: [qid] });
    assert.equal(s.questions[0].source, undefined);
    assert.equal(s.questions[0].correctAnswer, undefined);
    s = db.updateSession(s.id, {
      action: "answer",
      questionId: qid,
      answer: 2,
      revision: s.revision,
    });
    s = db.updateSession(s.id, { action: "finish", revision: s.revision });
    assert.equal(db.history(qid).length, 1);
    const again = await commitJob(db, id, {
      reviewed: true,
      candidates: grouped.candidates,
    });
    assert.equal(again.added, 0);
    assert.equal(again.skipped, 2);
    assert.equal(db.question(qid).title, "사용자가 바꾼 제목");
    assert.equal(db.history(qid).length, 1);
    assert.equal(db.questions({ status: "starred" })[0].memo, "보존할 메모");
    const backup = join(root, "full.pmrz");
    await createBackup(data, backup);
    const restored = join(root, "restored");
    restoreBackup(backup, restored);
    const other = new Store(restored);
    try {
      assert.equal(other.question(qid).source.filename, "데모.pptx");
      assert.equal(
        other.image(other.question(qid).questionImage).buffer.length,
        db.image(db.question(qid).questionImage).buffer.length,
      );
      assert.equal(other.history(qid).length, 1);
    } finally {
      other.close();
    }
    saveJob(dir, { phase: "ocr", pid: process.pid });
    const lock = join(data, "ppt-imports", "worker.lock");
    writeFileSync(lock, JSON.stringify({ id, pid: process.pid }));
    cancelJob(data, id);
    assert.equal(readFileSync(join(dir, "cancel.request"), "utf8"), "cancel");
    assert.equal(getJob(data, id).phase, "cancelled");
    assert.throws(() => deleteJob(data, id), /중지 처리/);
    rmSync(lock);
    deleteJob(data, id);
    assert.equal(db.question(qid).title, "사용자가 바꾼 제목");
    assert.ok(db.image(db.question(qid).questionImage).buffer.length > 0);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
