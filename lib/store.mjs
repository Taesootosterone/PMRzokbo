import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, createHash, randomInt } from "node:crypto";
import sharp from "sharp";
import { dataDirectory } from "./config.mjs";
import { questionSchema, conceptSchema, filterSchema } from "./schema.mjs";
import { externalNoteUrl } from "./notes.mjs";

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (message, status = 400) => {
  throw new AppError(status, message);
};
const now = () => new Date().toISOString();
export const assetPattern = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/;
export class Store {
  constructor(directory = dataDirectory()) {
    this.directory = directory;
    mkdirSync(join(directory, "images"), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, "bank.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (version > 1)
      fail("더 최신 앱이 만든 DB입니다. 앱을 업데이트하세요.", 409);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS concepts(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS links(question_id TEXT NOT NULL REFERENCES questions(id),concept_id TEXT NOT NULL REFERENCES concepts(id),PRIMARY KEY(question_id,concept_id));
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,mime TEXT NOT NULL,bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS personal(question_id TEXT PRIMARY KEY REFERENCES questions(id),starred INTEGER NOT NULL DEFAULT 0,memo TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,question_id TEXT NOT NULL REFERENCES questions(id),session_id TEXT NOT NULL REFERENCES sessions(id),selected INTEGER,correct INTEGER NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(session_id,question_id));
      CREATE INDEX IF NOT EXISTS attempts_latest ON attempts(question_id,seq DESC);
      CREATE INDEX IF NOT EXISTS links_concept ON links(concept_id);
      PRAGMA user_version=1;
    `);
  }
  close() {
    this.db.close();
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  concepts() {
    return this.db
      .prepare("SELECT data FROM concepts ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(r.data));
  }
  concept(id) {
    return (
      this.concepts().find((c) => c.id === id) ??
      fail("개념을 찾을 수 없습니다.", 404)
    );
  }
  saveConcept(input) {
    const c = conceptSchema.parse(input);
    c.id ||= `c_${randomUUID()}`;
    externalNoteUrl(c);
    this.db
      .prepare(
        "INSERT INTO concepts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(c.id, JSON.stringify(c));
    return c;
  }
  question(id) {
    const row = this.db
      .prepare("SELECT data FROM questions WHERE id=?")
      .get(id);
    if (!row) fail("문항을 찾을 수 없습니다.", 404);
    return {
      ...JSON.parse(row.data),
      conceptIds: this.db
        .prepare("SELECT concept_id FROM links WHERE question_id=?")
        .all(id)
        .map((r) => r.concept_id),
    };
  }
  validateQuestion(input, concepts = this.concepts(), assets = null) {
    const q = questionSchema.parse(input);
    q.id ||= `q_${randomUUID()}`;
    q.conceptIds = [...new Set(q.conceptIds)];
    for (const id of q.conceptIds)
      if (!concepts.some((c) => c.id === id))
        fail("연결할 개념이 존재하지 않습니다.");
    for (const asset of [q.questionImage, q.explanationImage].filter(Boolean)) {
      if (
        !this.db.prepare("SELECT id FROM assets WHERE id=?").get(asset) &&
        !assets?.has(asset)
      )
        fail("등록되지 않은 이미지입니다.");
    }
    return q;
  }
  writeQuestion(q) {
    const { conceptIds, ...body } = q;
    this.db
      .prepare(
        "INSERT INTO questions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
      )
      .run(q.id, JSON.stringify(body), now(), now());
    this.db.prepare("DELETE FROM links WHERE question_id=?").run(q.id);
    for (const id of conceptIds)
      this.db.prepare("INSERT INTO links VALUES(?,?)").run(q.id, id);
    return q;
  }
  saveQuestion(input) {
    const q = this.validateQuestion(input);
    return this.transaction(() => this.writeQuestion(q));
  }
  questions(filters = {}) {
    const f = filterSchema.parse(filters);
    const rows = this.db
      .prepare(
        `SELECT q.*,p.starred,p.memo,
      (SELECT correct FROM attempts a WHERE a.question_id=q.id ORDER BY seq DESC LIMIT 1) latest,
      (SELECT count(*) FROM attempts a WHERE a.question_id=q.id) attempt_count
      FROM questions q LEFT JOIN personal p ON p.question_id=q.id ORDER BY q.rowid`,
      )
      .all();
    const links = this.db.prepare("SELECT * FROM links").all();
    return rows
      .map((r) => ({
        ...JSON.parse(r.data),
        conceptIds: links
          .filter((l) => l.question_id === r.id)
          .map((l) => l.concept_id),
        starred: !!r.starred,
        memo: r.memo || "",
        latest: r.latest === null ? null : !!r.latest,
        attemptCount: r.attempt_count,
      }))
      .filter(
        (q) =>
          (!f.major || q.major === f.major) &&
          (!f.minor || q.minor === f.minor) &&
          (!f.year || q.year === f.year) &&
          (!f.examType || q.examType === f.examType) &&
          (!f.conceptId || q.conceptIds.includes(f.conceptId)) &&
          (!f.search ||
            `${q.title} ${q.major} ${q.minor} ${q.year}년 ${q.examType} ${q.originalNumber}번 ${q.stem}`
              .toLowerCase()
              .includes(f.search.toLowerCase())) &&
          (f.status === "all" ||
            (f.status === "unseen" && q.latest === null) ||
            (f.status === "wrong" && q.latest === false) ||
            (f.status === "starred" && q.starred) ||
            (f.status === "memo" && q.memo.trim())),
      );
  }
  personal(id, input) {
    this.question(id);
    if (input.starred !== undefined && typeof input.starred !== "boolean")
      fail("별표 값이 올바르지 않습니다.");
    if (
      input.memo !== undefined &&
      (typeof input.memo !== "string" || input.memo.length > 20000)
    )
      fail("메모는 20,000자 이하로 입력하세요.");
    const old = this.db
      .prepare("SELECT * FROM personal WHERE question_id=?")
      .get(id) || { starred: 0, memo: "" };
    this.db
      .prepare(
        "INSERT INTO personal VALUES(?,?,?) ON CONFLICT(question_id) DO UPDATE SET starred=excluded.starred,memo=excluded.memo",
      )
      .run(
        id,
        input.starred === undefined ? old.starred : Number(input.starred),
        input.memo ?? old.memo,
      );
    return this.questions().find((q) => q.id === id);
  }
  history(id) {
    this.question(id);
    return this.db
      .prepare("SELECT * FROM attempts WHERE question_id=? ORDER BY seq DESC")
      .all(id)
      .map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        selected: r.selected,
        correct: !!r.correct,
        snapshot: JSON.parse(r.snapshot),
        createdAt: r.created_at,
      }));
  }
  createSession(input) {
    if (!["study", "exam"].includes(input.mode))
      fail("학습 모드를 확인하세요.");
    let questions = this.questions(input.filters || {});
    if (input.questionIds) {
      if (
        !Array.isArray(input.questionIds) ||
        input.questionIds.length > 1000 ||
        input.questionIds.some((id) => typeof id !== "string")
      )
        fail("문항 목록을 확인하세요.");
      questions = [...new Set(input.questionIds)].map(
        (id) =>
          questions.find((q) => q.id === id) ??
          fail("문항 목록이 변경되었습니다."),
      );
    }
    if (!questions.length) fail("조건에 맞는 문항이 없습니다.");
    if (!["original", "random", undefined].includes(input.order))
      fail("문항 순서를 확인하세요.");
    if (input.order === "random")
      for (let i = questions.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    else
      questions.sort(
        (a, b) =>
          a.year - b.year ||
          a.examType.localeCompare(b.examType) ||
          a.originalNumber - b.originalNumber,
      );
    const count = input.count ?? questions.length;
    if (!Number.isInteger(count) || count < 1 || count > 1000)
      fail("문항 수는 1~1,000개여야 합니다.");
    questions = questions.slice(0, count);
    const session = {
      id: `s_${randomUUID()}`,
      mode: input.mode,
      status: "active",
      index: 0,
      answers: {},
      revealed: [],
      questions,
      createdAt: now(),
      updatedAt: now(),
      revision: 0,
    };
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?)")
      .run(session.id, JSON.stringify(session));
    return this.presentSession(session);
  }
  rawSession(id) {
    const row = this.db.prepare("SELECT data FROM sessions WHERE id=?").get(id);
    return row ? JSON.parse(row.data) : fail("풀이를 찾을 수 없습니다.", 404);
  }
  presentSession(s) {
    return {
      ...s,
      questions: s.questions.map((q) => {
        const personal = this.db
          .prepare("SELECT * FROM personal WHERE question_id=?")
          .get(q.id);
        const current = {
          ...q,
          starred: !!personal?.starred,
          memo: personal?.memo || "",
        };
        if (
          s.status === "completed" ||
          (s.mode === "study" && s.revealed.includes(q.id))
        )
          return current;
        const {
          correctAnswer,
          explanation,
          explanationImage,
          conceptIds,
          ...hidden
        } = current;
        void correctAnswer;
        void explanation;
        void explanationImage;
        void conceptIds;
        return hidden;
      }),
    };
  }
  session(id) {
    return this.presentSession(this.rawSession(id));
  }
  sessions() {
    return this.db
      .prepare("SELECT data FROM sessions ORDER BY rowid DESC LIMIT 30")
      .all()
      .map((r) => {
        const s = JSON.parse(r.data);
        return {
          id: s.id,
          mode: s.mode,
          status: s.status,
          count: s.questions.length,
          answered: Object.keys(s.answers).length,
          index: s.index,
          createdAt: s.createdAt,
        };
      });
  }
  record(s, q) {
    const selected = s.answers[q.id] ?? null;
    this.db
      .prepare(
        "INSERT INTO attempts(id,question_id,session_id,selected,correct,snapshot,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        `a_${randomUUID()}`,
        q.id,
        s.id,
        selected,
        Number(selected === q.correctAnswer),
        JSON.stringify(q),
        now(),
      );
  }
  updateSession(id, input) {
    return this.transaction(() => {
      const s = this.rawSession(id);
      if (input.revision !== s.revision)
        fail("다른 창에서 풀이가 변경되었습니다. 새로고침 후 계속하세요.", 409);
      if (s.status === "completed" && input.action !== "navigate")
        fail("이미 제출한 시험입니다.", 409);
      if (input.action === "answer") {
        const q = s.questions.find((q) => q.id === input.questionId);
        if (
          !q ||
          !Number.isInteger(input.answer) ||
          input.answer < 1 ||
          input.answer > 5
        )
          fail("답안을 확인하세요.");
        if (s.revealed.includes(q.id))
          fail("제출한 답은 변경할 수 없습니다.", 409);
        s.answers[q.id] = input.answer;
      } else if (input.action === "navigate") {
        if (
          !Number.isInteger(input.index) ||
          input.index < 0 ||
          input.index >= s.questions.length
        )
          fail("문항 위치를 확인하세요.");
        s.index = input.index;
      } else if (input.action === "reveal") {
        const q = s.questions[s.index];
        if (s.mode !== "study" || !s.answers[q.id] || s.revealed.includes(q.id))
          fail("먼저 답을 선택하세요.");
        this.record(s, q);
        s.revealed.push(q.id);
        if (s.revealed.length === s.questions.length) s.status = "completed";
      } else if (input.action === "finish") {
        if (s.mode !== "exam") fail("시험 모드에서만 최종 제출할 수 있습니다.");
        s.questions.forEach((q) => this.record(s, q));
        s.status = "completed";
      } else fail("알 수 없는 동작입니다.");
      s.revision++;
      s.updatedAt = now();
      this.db
        .prepare("UPDATE sessions SET data=? WHERE id=?")
        .run(JSON.stringify(s), s.id);
      return this.presentSession(s);
    });
  }
  async validateAsset(buffer) {
    if (buffer.length > 12 * 1024 * 1024 || !buffer.length)
      fail("이미지는 한 장에 12MB 이하로 등록하세요.");
    let metadata;
    try {
      metadata = await sharp(buffer, {
        limitInputPixels: 40_000_000,
      }).metadata();
      await sharp(buffer, { limitInputPixels: 40_000_000 }).stats();
    } catch {
      fail("읽을 수 없는 이미지입니다. PNG, JPEG, WebP, GIF를 사용하세요.");
    }
    const ext = { png: "png", jpeg: "jpg", webp: "webp", gif: "gif" }[
      metadata.format
    ];
    if (!ext) fail("PNG, JPEG, WebP, GIF만 지원합니다.");
    const id = `${createHash("sha256").update(buffer).digest("hex")}.${ext}`;
    return {
      id,
      mime: `image/${metadata.format}`,
      bytes: buffer.length,
      buffer,
    };
  }
  writeAsset(asset) {
    const path = join(this.directory, "images", asset.id);
    if (!existsSync(path))
      writeFileSync(path, asset.buffer, { flag: "wx", mode: 0o600 });
    else if (!readFileSync(path).equals(asset.buffer))
      fail("기존 이미지의 무결성 검사에 실패했습니다.", 409);
    this.db
      .prepare("INSERT OR IGNORE INTO assets VALUES(?,?,?)")
      .run(asset.id, asset.mime, asset.bytes);
    return { id: asset.id, url: `/api/v1/images/${asset.id}` };
  }
  async upload(buffer) {
    return this.writeAsset(await this.validateAsset(buffer));
  }
  image(id) {
    if (!assetPattern.test(id)) fail("이미지를 찾을 수 없습니다.", 404);
    const a = this.db.prepare("SELECT * FROM assets WHERE id=?").get(id);
    if (!a) fail("이미지를 찾을 수 없습니다.", 404);
    return { ...a, buffer: readFileSync(join(this.directory, "images", id)) };
  }
  exportContent() {
    return {
      format: "pmrzokbo-content",
      version: 1,
      exportedAt: now(),
      questions: this.db
        .prepare("SELECT data FROM questions")
        .all()
        .map((r) => JSON.parse(r.data)),
      concepts: this.concepts(),
      links: this.db
        .prepare("SELECT question_id,concept_id FROM links")
        .all()
        .map((r) => ({ questionId: r.question_id, conceptId: r.concept_id })),
      assets: this.db
        .prepare("SELECT id FROM assets")
        .all()
        .map((r) => ({
          id: r.id,
          base64: this.image(r.id).buffer.toString("base64"),
        })),
    };
  }
  async importContent(input) {
    if (input?.format !== "pmrzokbo-content" || input.version !== 1)
      fail(
        "PMRZokbo 문항 JSON v1만 가져올 수 있습니다. NOAH 백업은 사용할 수 없습니다.",
      );
    for (const field of ["questions", "concepts", "links", "assets"])
      if (!Array.isArray(input[field])) fail(`${field} 배열이 필요합니다.`);
    if (
      input.questions.length > 10000 ||
      input.assets.length > 20000 ||
      input.concepts.length > 10000 ||
      input.links.length > 100000
    )
      fail("한 번에 가져올 수 있는 항목 수를 초과했습니다.");
    const unique = (items) => {
      if (new Set(items.map((i) => i.id)).size !== items.length)
        fail("JSON 안에 중복 ID가 있습니다.");
    };
    unique(input.questions);
    unique(input.concepts);
    unique(input.assets);
    const concepts = input.concepts.map((c) => {
      if (!c.id) fail("가져올 개념에는 ID가 필요합니다.");
      const parsed = conceptSchema.parse(c);
      externalNoteUrl(parsed);
      return parsed;
    });
    const assets = [];
    for (const a of input.assets) {
      if (
        typeof a.base64 !== "string" ||
        a.base64.length > 17 * 1024 * 1024 ||
        !assetPattern.test(a.id)
      )
        fail("이미지 데이터 형식을 확인하세요.");
      const parsed = await this.validateAsset(Buffer.from(a.base64, "base64"));
      if (parsed.id !== a.id) fail("이미지 해시가 일치하지 않습니다.");
      assets.push(parsed);
    }
    const combined = [...this.concepts(), ...concepts];
    const assetIds = new Set(assets.map((a) => a.id));
    const questions = input.questions.map((q) => {
      if (!q.id) fail("가져올 문항에는 ID가 필요합니다.");
      return this.validateQuestion(
        { ...q, conceptIds: [] },
        combined,
        assetIds,
      );
    });
    const qids = new Set([
      ...this.questions().map((q) => q.id),
      ...questions.map((q) => q.id),
    ]);
    for (const l of input.links)
      if (
        !qids.has(l.questionId) ||
        !combined.some((c) => c.id === l.conceptId)
      )
        fail("존재하지 않는 문항 또는 개념의 연결입니다.");
    return this.transaction(() => {
      let addedQuestions = 0,
        addedConcepts = 0,
        addedLinks = 0;
      for (const a of assets) this.writeAsset(a);
      for (const c of concepts)
        if (!this.db.prepare("SELECT id FROM concepts WHERE id=?").get(c.id)) {
          this.saveConcept(c);
          addedConcepts++;
        }
      for (const q of questions)
        if (!this.db.prepare("SELECT id FROM questions WHERE id=?").get(q.id)) {
          this.writeQuestion(q);
          addedQuestions++;
        }
      for (const l of input.links)
        addedLinks += Number(
          this.db
            .prepare("INSERT OR IGNORE INTO links VALUES(?,?)")
            .run(l.questionId, l.conceptId).changes,
        );
      return {
        addedQuestions,
        addedConcepts,
        addedLinks,
        skippedQuestions: questions.length - addedQuestions,
      };
    });
  }
  stats() {
    const q = this.questions();
    return {
      total: q.length,
      solved: q.filter((q) => q.latest !== null).length,
      wrong: q.filter((q) => q.latest === false).length,
      starred: q.filter((q) => q.starred).length,
      attempts: Number(
        this.db.prepare("SELECT count(*) n FROM attempts").get().n,
      ),
      correct: Number(
        this.db.prepare("SELECT count(*) n FROM attempts WHERE correct=1").get()
          .n,
      ),
    };
  }
}
let singleton;
export function store() {
  return (singleton ??= new Store());
}
