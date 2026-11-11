import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { spawnSync } from "node:child_process";
import { Store } from "../lib/store.mjs";
import { demoContent } from "../lib/demo.mjs";
import { createBackup, restoreBackup } from "../lib/backup.mjs";
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-test-"));
  return {
    root,
    db: new Store(join(root, "data")),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
};
const patch = (db, s, input) =>
  db.updateSession(s.id, { ...input, revision: s.revision });
test("wrong → correct preserves both attempts; independent stars/memo; snapshots survive edits", async () => {
  const t = setup(),
    db = t.db;
  try {
    await db.importContent(demoContent);
    const q = db.questions()[0];
    db.personal(q.id, { starred: true, memo: "기록 보존 확인" });
    let s = db.createSession({ mode: "study", questionIds: [q.id] });
    s = patch(db, s, { action: "answer", questionId: q.id, answer: 2 });
    s = patch(db, s, { action: "reveal" });
    assert.equal(db.questions({ status: "wrong" }).length, 1);
    assert.equal(db.history(q.id).length, 1);
    db.saveQuestion({
      ...db.question(q.id),
      correctAnswer: 5,
      title: "수정한 제목",
    });
    assert.equal(db.history(q.id)[0].snapshot.correctAnswer, 1);
    s = db.createSession({ mode: "study", questionIds: [q.id] });
    s = patch(db, s, { action: "answer", questionId: q.id, answer: 5 });
    s = patch(db, s, { action: "reveal" });
    assert.equal(db.questions({ status: "wrong" }).length, 0);
    assert.equal(db.history(q.id).length, 2);
    assert.deepEqual(
      db.history(q.id).map((h) => h.correct),
      [true, false],
    );
    assert.equal(db.questions({ status: "starred" }).length, 1);
    assert.equal(db.questions({ status: "memo" }).length, 1);
  } finally {
    db.close();
    t.cleanup();
  }
});
test("exam has no answers/explanations before finish, reopens saved answers, enforces revisions and single grading", async () => {
  const t = setup();
  let db = t.db;
  try {
    await db.importContent(demoContent);
    let s = db.createSession({ mode: "exam", count: 2 });
    assert.equal(s.questions[0].correctAnswer, undefined);
    assert.equal(s.questions[0].explanation, undefined);
    assert.equal(s.questions[0].explanationImage, undefined);
    const id = s.questions[0].id;
    s = patch(db, s, { action: "answer", questionId: id, answer: 2 });
    assert.throws(
      () =>
        db.updateSession(s.id, {
          action: "answer",
          questionId: id,
          answer: 1,
          revision: 0,
        }),
      /다른 창/,
    );
    s = patch(db, s, { action: "navigate", index: 1 });
    const sid = s.id;
    db.close();
    db = new Store(join(t.root, "data"));
    s = db.session(sid);
    assert.equal(s.index, 1);
    assert.equal(s.answers[id], 2);
    assert.equal(db.history(id).length, 0);
    s = patch(db, s, { action: "navigate", index: 0 });
    s = patch(db, s, { action: "answer", questionId: id, answer: 1 });
    s = patch(db, s, { action: "finish" });
    assert.equal(s.questions[0].correctAnswer, 1);
    assert.equal(db.history(id).length, 1);
    assert.equal(db.history(s.questions[1].id)[0].selected, null);
    s = patch(db, s, { action: "navigate", index: 1 });
    assert.equal(s.index, 1);
    assert.throws(() => patch(db, s, { action: "finish" }), /이미 제출/);
    assert.equal(db.history(id).length, 1);
  } finally {
    db.close();
    t.cleanup();
  }
});
test("content JSON import is idempotent, preserves IDs and existing contents; unions links atomically", async () => {
  const t = setup(),
    db = t.db;
  try {
    const first = await db.importContent(demoContent);
    assert.equal(first.addedQuestions, 2);
    const second = await db.importContent(demoContent);
    assert.deepEqual(second, {
      addedQuestions: 0,
      addedConcepts: 0,
      addedLinks: 0,
      skippedQuestions: 2,
    });
    const q = db.question(demoContent.questions[0].id);
    db.saveQuestion({ ...q, title: "유지할 사용자 수정", conceptIds: [] });
    await db.importContent(demoContent);
    assert.equal(db.question(q.id).title, "유지할 사용자 수정");
    assert.equal(db.question(q.id).conceptIds.length, 2);
    const before = db.exportContent();
    const invalid = structuredClone(demoContent);
    invalid.links.push({ questionId: "missing", conceptId: "missing" });
    await assert.rejects(db.importContent(invalid), /존재하지 않는/);
    assert.equal(db.questions().length, before.questions.length);
    await assert.rejects(
      db.importContent({ format: "pmr-notes", version: 1 }),
      /NOAH/,
    );
    assert.throws(() =>
      db.saveConcept({ name: "bad", externalUrl: "javascript:alert(1)" }),
    );
    const roundTrip = new Store(join(t.root, "other"));
    try {
      await roundTrip.importContent(db.exportContent());
      assert.equal(roundTrip.questions().length, 2);
      assert.equal(roundTrip.concepts().length, 2);
      assert.equal(roundTrip.question(q.id).conceptIds.length, 2);
    } finally {
      roundTrip.close();
    }
  } finally {
    db.close();
    t.cleanup();
  }
});
test("full backup restores DB, exact images, attempts, active sessions, memo/stars/links; overwrite and corruption guards", async () => {
  const t = setup(),
    db = t.db;
  try {
    await db.importContent(demoContent);
    const buffer = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#c7ded0" },
    })
      .png()
      .toBuffer();
    const asset = await db.upload(buffer);
    const q = db.question(demoContent.questions[0].id);
    db.saveQuestion({
      ...q,
      questionImage: asset.id,
      explanationImage: asset.id,
    });
    db.personal(q.id, { starred: true, memo: "백업 메모" });
    let s = db.createSession({ mode: "study", questionIds: [q.id] });
    s = patch(db, s, { action: "answer", questionId: q.id, answer: 2 });
    s = patch(db, s, { action: "reveal" });
    let active = db.createSession({ mode: "exam", count: 2 });
    active = patch(db, active, {
      action: "answer",
      questionId: q.id,
      answer: 4,
    });
    const backupFile = join(t.root, "complete.pmrz");
    await createBackup(db.directory, backupFile);
    const target = join(t.root, "restored");
    restoreBackup(backupFile, target);
    const restored = new Store(target);
    try {
      assert.equal(restored.questions().length, 2);
      assert.equal(restored.history(q.id).length, 1);
      assert.equal(restored.question(q.id).conceptIds.length, 2);
      assert.ok(restored.image(asset.id).buffer.equals(buffer));
      assert.equal(
        restored.questions({ status: "starred" })[0].memo,
        "백업 메모",
      );
      assert.equal(restored.session(active.id).answers[q.id], 4);
    } finally {
      restored.close();
    }
    assert.throws(() => restoreBackup(backupFile, target), /confirm-overwrite/);
    const replacement = restoreBackup(backupFile, target, {
      confirmOverwrite: true,
    });
    assert.ok(replacement.previous);
    writeFileSync(join(target, ".server.lock"), String(process.pid));
    assert.throws(
      () => restoreBackup(backupFile, target, { confirmOverwrite: true }),
      /실행 중/,
    );
    const bad = JSON.parse(readFileSync(backupFile, "utf8"));
    bad.files[0].sha256 = "bad";
    writeFileSync(join(t.root, "bad.pmrz"), JSON.stringify(bad));
    assert.throws(
      () => restoreBackup(join(t.root, "bad.pmrz"), join(t.root, "bad-target")),
      /체크섬/,
    );
  } finally {
    db.close();
    t.cleanup();
  }
});

test("documented backup/restore CLI works in separate directories and refuses implicit overwrite", async () => {
  const t = setup();
  try {
    await t.db.importContent(demoContent);
    const file = join(t.root, "cli.pmrz"),
      restored = join(t.root, "cli-restored");
    const command = (args, dir) =>
      spawnSync(process.execPath, ["scripts/data.mjs", ...args], {
        cwd: process.cwd(),
        env: { ...process.env, PMRZ_DATA_DIR: dir },
        encoding: "utf8",
      });
    let result = command(["backup", file], t.db.directory);
    assert.equal(result.status, 0, result.stderr);
    result = command(["restore", file], restored);
    assert.equal(result.status, 0, result.stderr);
    const check = new Store(restored);
    assert.equal(check.questions().length, 2);
    check.close();
    result = command(["restore", file], restored);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /confirm-overwrite/);
    result = command(["restore", file, "--confirm-overwrite"], restored);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    t.db.close();
    t.cleanup();
  }
});
