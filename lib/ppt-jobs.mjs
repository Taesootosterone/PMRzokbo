import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  readdirSync,
  rmSync,
  openSync,
  closeSync,
  createWriteStream,
  renameSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { writeJson, readJson } from "./update-state.mjs";
import {
  MAX_PPT_BYTES,
  parseSlides,
  groupSlides,
  fileMetadata,
  importedId,
  normalize,
} from "./ppt-model.mjs";
import { AppError } from "./store.mjs";

export const importRoot = (data) => join(data, "ppt-imports");
export function jobDirectory(data, id) {
  if (!/^[a-f0-9-]{36}$/.test(id))
    throw new AppError(404, "PPT 분석을 찾을 수 없습니다.");
  return join(importRoot(data), id);
}
export function getJob(data, id) {
  const dir = jobDirectory(data, id);
  if (!existsSync(join(dir, "job.json")))
    throw new AppError(404, "PPT 분석을 찾을 수 없습니다.");
  const job = readJson(join(dir, "job.json"));
  if (
    [
      "queued",
      "analyzing",
      "converting",
      "rendering",
      "ocr",
      "committing",
      "uploading-pdf",
    ].includes(job.phase) &&
    Date.now() - new Date(job.updatedAt).getTime() > 15000
  ) {
    let alive = false;
    if (Number.isInteger(job.pid))
      try {
        process.kill(job.pid, 0);
        alive = true;
      } catch {}
    if (!alive) {
      const committed = job.phase === "committing";
      job.phase = committed ? "ready" : "error";
      job.error = committed
        ? "등록 확인이 중단되었습니다. 다시 등록해도 같은 원본 문항은 중복되지 않습니다."
        : "분석이 중단되었습니다. 원본은 보존되어 있으니 다시 분석하세요.";
      saveJob(dir, job);
    }
  }
  return job;
}
export function saveJob(dir, patch) {
  const old = readJson(join(dir, "job.json"), {}),
    job = { ...old, ...patch, updatedAt: new Date().toISOString() };
  writeJson(join(dir, "job.json"), job);
  return job;
}
export function listJobs(data) {
  const root = importRoot(data);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((s) => /^[a-f0-9-]{36}$/.test(s))
    .map((id) => {
      try {
        const { candidates, slides, reviewDrafts, ...job } = getJob(data, id);
        return { ...job, candidateCount: candidates?.length || 0 };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function acceptPresentation(req, data) {
  let filename;
  try {
    filename = decodeURIComponent(req.headers.get("x-pmrz-filename") || "");
  } catch {
    throw new AppError(400, "파일 이름을 확인하세요.");
  }
  filename = filename
    .normalize("NFC")
    .replace(/[\x00-\x1f/\\]/g, "_")
    .slice(0, 240);
  if (!/\.pptx$/i.test(filename))
    throw new AppError(
      400,
      "PowerPoint .pptx 파일을 선택하세요. .ppt는 PowerPoint에서 .pptx로 저장하세요.",
    );
  if (!req.body) throw new AppError(400, "PPTX 파일이 없습니다.");
  const id = randomUUID(),
    dir = jobDirectory(data, id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  let bytes = 0;
  const hash = createHash("sha256");
  try {
    await pipeline(
      Readable.fromWeb(req.body),
      new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > MAX_PPT_BYTES)
            return callback(
              new AppError(413, "PPTX는 256MB 이하로 나누어 주세요."),
            );
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(join(dir, "source.pptx"), { flags: "wx", mode: 0o600 }),
    );
    if (bytes < 20)
      throw new AppError(400, "PPTX 파일이 비어 있거나 손상되었습니다.");
    const job = saveJob(dir, {
      id,
      filename,
      sha256: hash.digest("hex"),
      bytes,
      phase: "uploaded",
      progress: 0,
      createdAt: new Date().toISOString(),
      metadata: fileMetadata(filename),
      ocr: req.headers.get("x-pmrz-ocr") !== "0",
      renderMode: ["office", "pdf"].includes(
        req.headers.get("x-pmrz-render-mode"),
      )
        ? req.headers.get("x-pmrz-render-mode")
        : "native",
      slides: [],
      candidates: [],
      warnings: [],
      error: null,
    });
    return startJob(data, job.id);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
export async function acceptRenderPdf(req, data, id) {
  const dir = jobDirectory(data, id),
    previous = getJob(data, id);
  if (
    ![
      "awaiting-pdf",
      "error",
      "cancelled",
      "uploaded",
      "ready",
      "committed",
    ].includes(previous.phase)
  )
    throw new AppError(
      409,
      "PDF를 기다리는 작업에 파일을 올려 주세요. 분석 중에는 바꿀 수 없습니다.",
    );
  let filename;
  try {
    filename = decodeURIComponent(req.headers.get("x-pmrz-filename") || "");
  } catch {
    throw new AppError(400, "PDF 파일 이름을 확인하세요.");
  }
  filename = filename
    .normalize("NFC")
    .replace(/[\x00-\x1f/\\]/g, "_")
    .slice(0, 240);
  if (!/\.pdf$/i.test(filename) || !req.body)
    throw new AppError(400, "같은 PPT에서 저장한 PDF 파일을 선택하세요.");
  const partial = join(dir, "render-input.partial"),
    hash = createHash("sha256");
  let bytes = 0,
    signature = Buffer.alloc(0),
    installed = false;
  saveJob(dir, { phase: "uploading-pdf", pid: process.pid, error: null });
  try {
    await pipeline(
      Readable.fromWeb(req.body),
      new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > MAX_PPT_BYTES)
            return callback(
              new AppError(413, "PDF는 256MB 이하로 나누어 주세요."),
            );
          if (signature.length < 5)
            signature = Buffer.concat([
              signature,
              chunk.subarray(0, 5 - signature.length),
            ]);
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(partial, { flags: "w", mode: 0o600 }),
    );
    if (signature.toString("ascii") !== "%PDF-")
      throw new AppError(
        400,
        "PDF 형식을 확인하지 못했습니다. 원본 PPT를 PDF로 다시 저장해 주세요.",
      );
    renameSync(partial, join(dir, "render-input.pdf"));
    installed = true;
    saveJob(dir, {
      phase: "uploaded",
      renderMode: "pdf",
      pdfFilename: filename,
      pdfBytes: bytes,
      pdfSha256: hash.digest("hex"),
      error: null,
    });
    return startJob(data, id);
  } catch (error) {
    rmSync(partial, { force: true });
    saveJob(dir, {
      phase: installed ? "error" : previous.phase,
      error: error.message,
    });
    throw error;
  }
}
export function startJob(data, id, options = {}) {
  const dir = jobDirectory(data, id),
    job = getJob(data, id);
  if (
    [
      "queued",
      "analyzing",
      "converting",
      "rendering",
      "ocr",
      "committing",
      "uploading-pdf",
    ].includes(job.phase)
  )
    throw new AppError(409, "이 PPT를 처리 중입니다.");
  const root = importRoot(data),
    slot = join(root, "worker.lock");
  if (existsSync(slot)) {
    try {
      const previous = readJson(slot);
      process.kill(previous.pid, 0);
      throw new AppError(
        409,
        "다른 PPT 분석이 진행 중입니다. 완료 후 다시 분석하세요.",
      );
    } catch (error) {
      if (error.status) throw error;
      if (error.code !== "ESRCH")
        throw new AppError(409, "분석 잠금을 확인하세요.");
      rmSync(slot);
    }
  }
  writeJson(slot, { pid: process.pid, id });
  saveJob(dir, {
    phase: "queued",
    pdfReady: false,
    slides: [],
    candidates: [],
    reviewDrafts: null,
    conversionWarnings: [],
    ...(options.renderMode
      ? {
          renderMode: ["office", "pdf"].includes(options.renderMode)
            ? options.renderMode
            : "native",
        }
      : {}),
    error: null,
    progress: 0,
    commitResult: job.commitResult || null,
  });
  rmSync(join(dir, "cancel.request"), { force: true });
  const log = openSync(join(dir, "worker.log"), "a", 0o600);
  let child;
  try {
    child = spawn(
      process.execPath,
      [join(process.cwd(), "scripts/ppt-worker.mjs"), data, id],
      { cwd: process.cwd(), env: process.env, stdio: ["ignore", log, log] },
    );
  } finally {
    closeSync(log);
  }
  child.on("error", () => {
    saveJob(dir, {
      phase: "error",
      error: "분석 프로세스를 시작하지 못했습니다.",
    });
    if (readJson(slot)?.id === id) rmSync(slot, { force: true });
  });
  child.on("exit", (code) => {
    if (code) {
      const current = readJson(join(dir, "job.json"));
      if (
        !["error", "cancelled", "ready", "committed"].includes(current?.phase)
      )
        saveJob(dir, {
          phase: "error",
          error:
            "분석이 종료되었습니다. PPTX·PDF 파일 상태를 확인하고 다시 분석하세요.",
        });
    }
    if (readJson(slot)?.id === id) rmSync(slot, { force: true });
  });
  if (child.pid) {
    writeJson(slot, { pid: child.pid, id });
    saveJob(dir, { pid: child.pid });
    child.unref();
  }
  return getJob(data, id);
}
export function cancelJob(data, id) {
  const job = getJob(data, id);
  if (
    !["queued", "analyzing", "converting", "rendering", "ocr"].includes(
      job.phase,
    )
  )
    throw new AppError(409, "분석 중인 PPT만 중지할 수 있습니다.");
  const lock = readJson(join(importRoot(data), "worker.lock"));
  if (lock?.id !== id || lock.pid !== job.pid)
    throw new AppError(409, "분석 프로세스를 확인하지 못했습니다.");
  writeFileSync(join(jobDirectory(data, id), "cancel.request"), "cancel", {
    mode: 0o600,
  });
  return saveJob(jobDirectory(data, id), {
    phase: "cancelled",
    error: "분석을 중지했습니다. 원본 파일은 보존됩니다.",
  });
}
export function deleteJob(data, id) {
  const job = getJob(data, id);
  if (
    [
      "queued",
      "analyzing",
      "converting",
      "rendering",
      "ocr",
      "committing",
      "uploading-pdf",
    ].includes(job.phase)
  )
    throw new AppError(409, "진행 중인 작업을 마친 뒤 삭제하세요.");
  const lock = readJson(join(importRoot(data), "worker.lock"));
  if (lock?.id === id) {
    try {
      process.kill(lock.pid, 0);
      throw new AppError(
        409,
        "분석 중지 처리가 끝난 뒤 삭제하세요. 잠시 후 다시 시도하세요.",
      );
    } catch (error) {
      if (error.status) throw error;
      if (error.code !== "ESRCH")
        throw new AppError(409, "분석 프로세스 상태를 확인하세요.");
    }
  }
  rmSync(jobDirectory(data, id), { recursive: true });
  return { deleted: true };
}
export function regroupJob(data, id, input) {
  const job = getJob(data, id);
  if (!["ready", "committed"].includes(job.phase))
    throw new AppError(409, "분석 완료 후 묶음을 수정하세요.");
  const grouped = groupSlides(
    job.slides,
    input.options,
    input.metadata || job.metadata,
  );
  return saveJob(jobDirectory(data, id), {
    ...grouped,
    reviewDrafts: null,
    phase: "ready",
    commitResult: job.commitResult || null,
  });
}
export function saveReview(data, id, input) {
  const job = getJob(data, id);
  if (!["ready", "committed"].includes(job.phase))
    throw new AppError(409, "분석 완료 후 검토 초안을 저장하세요.");
  if (
    !Array.isArray(input.candidates) ||
    input.candidates.length !== job.candidates.length
  )
    throw new AppError(
      400,
      "분석한 문항 수와 검토 초안이 다릅니다. 다시 불러오세요.",
    );
  const used = new Set(),
    reviewDrafts = input.candidates.map((value) => {
      const original = job.candidates.find((c) => c.key === value.key);
      if (!original || used.has(value.key))
        throw new AppError(400, "검토할 문항 ID를 확인하세요.");
      used.add(value.key);
      const edited = { ...original };
      for (const [key, max] of [
        ["title", 240],
        ["major", 100],
        ["minor", 100],
        ["examType", 100],
        ["qInput", 8000],
        ["eInput", 8000],
        ["conceptInput", 3000],
      ]) {
        if (typeof value[key] !== "string" || value[key].length > max)
          throw new AppError(400, "검토 초안의 입력 길이를 확인하세요.");
        edited[key] = value[key];
      }
      for (const key of ["year", "originalNumber"])
        edited[key] = Number.isFinite(value[key]) ? value[key] : 0;
      edited.correctAnswer =
        Number.isInteger(value.correctAnswer) &&
        value.correctAnswer >= 1 &&
        value.correctAnswer <= 5
          ? value.correctAnswer
          : null;
      edited.selected = !!value.selected;
      return edited;
    });
  return saveJob(jobDirectory(data, id), { reviewDrafts });
}
export function validateDrafts(job, input) {
  if (
    !Array.isArray(input.candidates) ||
    !input.candidates.length ||
    input.candidates.length > 1000
  )
    throw new AppError(400, "등록할 문항을 1~1,000개 선택하세요.");
  const keys = new Set(job.candidates.map((c) => c.key)),
    used = new Set();
  return input.candidates.map((item) => {
    if (!keys.has(item.key))
      throw new AppError(400, "원본 분석에 없는 문항입니다.");
    const questionSlides = parseSlides(item.questionSlides, job.slides.length),
      explanationSlides = parseSlides(
        item.explanationSlides,
        job.slides.length,
      );
    if (
      !questionSlides.length ||
      !explanationSlides.length ||
      questionSlides.some((n) => explanationSlides.includes(n))
    )
      throw new AppError(
        400,
        "문제와 정답·해설 슬라이드는 각각 필요하며 겹칠 수 없습니다.",
      );
    for (const page of questionSlides) {
      if (used.has(page))
        throw new AppError(400, "선택 문항에 같은 문제 슬라이드가 중복됩니다.");
      used.add(page);
    }
    if (
      !Number.isInteger(item.correctAnswer) ||
      item.correctAnswer < 1 ||
      item.correctAnswer > 5
    )
      throw new AppError(400, "모든 선택 문항의 정답을 ①~⑤로 지정하세요.");
    for (const key of ["title", "major", "minor", "examType"])
      if (
        typeof item[key] !== "string" ||
        !item[key].trim() ||
        item[key].length > 240
      )
        throw new AppError(
          400,
          "문항 제목·대단원·소단원·시험 종류를 확인하세요.",
        );
    if (
      !Number.isInteger(item.year) ||
      item.year < 1900 ||
      item.year > 2200 ||
      !Number.isInteger(item.originalNumber) ||
      item.originalNumber < 1 ||
      item.originalNumber > 10000
    )
      throw new AppError(400, "연도·원래 문제번호를 확인하세요.");
    const conceptNames = [
      ...new Set((item.conceptNames || []).map(normalize).filter(Boolean)),
    ];
    if (conceptNames.length > 15 || conceptNames.some((s) => s.length > 160))
      throw new AppError(
        400,
        "관련 개념은 문항당 15개, 이름은 160자 이하로 입력하세요.",
      );
    return {
      ...item,
      questionSlides,
      explanationSlides,
      conceptNames,
      id: importedId(job.sha256, questionSlides),
    };
  });
}
export async function commitJob(db, id, input) {
  const dir = jobDirectory(db.directory, id),
    job = getJob(db.directory, id);
  if (!["ready", "committed"].includes(job.phase))
    throw new AppError(409, "분석이 완료된 문항만 등록할 수 있습니다.");
  if (input.reviewed !== true)
    throw new AppError(
      400,
      "선택한 문항의 묶음·정답·분류를 확인한 뒤 등록하세요.",
    );
  const items = validateDrafts(job, input),
    lock = join(importRoot(db.directory), "commit.lock"),
    owner = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  if (existsSync(lock)) {
    try {
      process.kill(JSON.parse(readFileSync(lock, "utf8")).pid, 0);
      throw new AppError(
        409,
        "다른 PPT 문항 등록이 진행 중입니다. 완료 후 다시 시도하세요.",
      );
    } catch (error) {
      if (error.status) throw error;
      if (error.code !== "ESRCH")
        throw new AppError(409, "PPT 등록 잠금을 확인하세요.");
      rmSync(lock);
    }
  }
  try {
    writeFileSync(lock, owner, { flag: "wx", mode: 0o600 });
  } catch {
    throw new AppError(409, "다른 PPT 문항 등록이 진행 중입니다.");
  }
  saveJob(dir, { phase: "committing", error: null, pid: process.pid });
  try {
    const { composeSlides } = await import("./ppt-local.mjs"),
      prepared = [];
    const existing = db.concepts(),
      names = new Map(
        existing.map((c) => [normalize(c.name).toLowerCase(), c]),
      );
    const concepts = [];
    let skipped = 0;
    for (const item of items) {
      if (db.db.prepare("SELECT id FROM questions WHERE id=?").get(item.id)) {
        skipped++;
        continue;
      }
      const questionImage = await db.upload(
          await composeSlides(dir, item.questionSlides),
        ),
        explanationImage = await db.upload(
          await composeSlides(dir, item.explanationSlides),
        );
      const conceptIds = item.conceptNames.map((name) => {
        const key = normalize(name).toLowerCase();
        let concept = names.get(key);
        if (!concept) {
          concept = {
            id: `c_${randomUUID()}`,
            name,
            noahNoteId: "",
            externalUrl: "",
          };
          names.set(key, concept);
          concepts.push(concept);
        }
        return concept.id;
      });
      const selectText = (pages) =>
        job.slides
          .filter((s) => pages.includes(s.number))
          .map((s) => s.text)
          .join("\n")
          .slice(0, 50000);
      const explanation = job.slides
        .filter(
          (s) => item.explanationSlides.includes(s.number) && s.notes?.trim(),
        )
        .map((s) => `[슬라이드 ${s.number} 발표자노트]\n${s.notes}`)
        .join("\n\n");
      if (explanation.length > 50000)
        throw new AppError(
          400,
          "발표자노트가 너무 깁니다. 문항의 해설 슬라이드를 나누어 주세요.",
        );
      const q = {
        id: item.id,
        title: item.title,
        major: item.major,
        minor: item.minor,
        year: item.year,
        examType: item.examType,
        originalNumber: item.originalNumber,
        correctAnswer: item.correctAnswer,
        questionImage: questionImage.id,
        explanationImage: explanationImage.id,
        explanation,
        isDemo: !!input.isDemo,
        conceptIds,
        source: {
          kind: "pptx",
          filename: job.filename,
          sha256: job.sha256,
          questionSlides: item.questionSlides,
          explanationSlides: item.explanationSlides,
          questionText: selectText(item.questionSlides),
          explanationText: selectText(item.explanationSlides),
        },
      };
      prepared.push(db.validateQuestion(q, [...existing, ...concepts]));
    }
    const result = db.transaction(() => {
      for (const c of concepts) db.saveConcept(c);
      for (const q of prepared) db.writeQuestion(q);
      return {
        added: prepared.length,
        skipped,
        questionIds: items.map((q) => q.id),
      };
    });
    saveJob(dir, {
      phase: "committed",
      reviewDrafts: null,
      commitResult: result,
      candidates: job.candidates.map((c) => {
        const edited = items.find((i) => i.key === c.key);
        return edited ? { ...c, ...edited } : c;
      }),
    });
    return result;
  } catch (error) {
    saveJob(dir, { phase: "ready", error: error.message });
    throw error;
  } finally {
    if (existsSync(lock) && readFileSync(lock, "utf8") === owner) rmSync(lock);
  }
}
