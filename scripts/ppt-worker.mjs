import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { readPresentation } from "../lib/ppt-archive.mjs";
import {
  convertPresentation,
  openPdf,
  renderSlide,
  createOcr,
} from "../lib/ppt-render.mjs";
import { groupSlides, detectAnswer } from "../lib/ppt-model.mjs";
import { jobDirectory, importRoot, getJob, saveJob } from "../lib/ppt-jobs.mjs";
import { readJson } from "../lib/update-state.mjs";
const [data, id] = process.argv.slice(2),
  dir = jobDirectory(data, id),
  abort = new AbortController();
let ocr, pdf, closePdf;
function requestStop() {
  if (abort.signal.aborted) return;
  abort.abort();
  void ocr?.terminate().catch(() => {});
}
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
  process.once(signal, requestStop);
const cancellation = setInterval(() => {
  if (existsSync(join(dir, "cancel.request"))) requestStop();
}, 500);
cancellation.unref();
try {
  const lock = readJson(join(importRoot(data), "worker.lock"));
  if (lock?.id !== id)
    throw new Error("분석 작업의 소유 정보를 확인할 수 없습니다.");
  const job = getJob(data, id);
  saveJob(dir, { phase: "analyzing", progress: 0, pid: process.pid });
  const slides = await readPresentation(join(dir, "source.pptx"));
  saveJob(dir, {
    phase: "rendering",
    totalSlides: slides.length,
    completedSlides: 0,
  });
  const file = await convertPresentation(dir, abort.signal),
    document = await openPdf(file);
  pdf = document.pdf;
  closePdf = document.destroy;
  if (pdf.numPages !== slides.length)
    throw new Error(
      "PPT와 변환된 화면의 장수가 다릅니다. 숨김 슬라이드를 표시한 새 파일로 저장하세요.",
    );
  let ocrCount = 0;
  for (let i = 0; i < slides.length; i++) {
    if (abort.signal.aborted) throw new Error("분석을 중지했습니다.");
    const slide = slides[i],
      rendered = await renderSlide(pdf, document.canvas, i + 1, dir);
    if (rendered.text.trim().length > slide.text.trim().length)
      slide.text = rendered.text;
    if (
      job.ocr &&
      slide.text.replace(/\s/g, "").length < 80 &&
      !detectAnswer(slide.text).answer
    ) {
      saveJob(dir, {
        phase: "ocr",
        progress: Math.round((i / slides.length) * 95),
        completedSlides: i,
      });
      if (!ocr) ocr = await createOcr(importRoot(data));
      try {
        const recognized = await ocr.recognize(rendered.png);
        slide.ocrText = recognized.data.text.trim().slice(0, 20000);
        slide.ocrConfidence = Math.round(recognized.data.confidence);
        if (slide.ocrConfidence >= 50)
          slide.text = [slide.text.trim(), slide.ocrText]
            .filter(Boolean)
            .join("\n");
        else
          slide.ocrError =
            "OCR 신뢰도가 낮아 자동 정답·분류에 사용하지 않았습니다.";
        ocrCount++;
      } catch (error) {
        if (abort.signal.aborted) throw error;
        slide.ocrError = "OCR 결과를 확인하지 못했습니다.";
      }
    }
    slide.text = slide.text.slice(0, 20000);
    slide.notes = slide.notes.slice(0, 20000);
    saveJob(dir, {
      phase: "rendering",
      completedSlides: i + 1,
      progress: Math.round(((i + 1) / slides.length) * 95),
    });
  }
  const grouped = groupSlides(slides, { mode: "auto" }, job.metadata);
  saveJob(dir, {
    ...grouped,
    reviewDrafts: null,
    slides,
    ocrCount,
    phase: "ready",
    progress: 100,
    completedSlides: slides.length,
    error: null,
  });
} catch (error) {
  saveJob(dir, {
    phase: abort.signal.aborted ? "cancelled" : "error",
    error: String(error.message || error).slice(0, 800),
  });
  process.exitCode = abort.signal.aborted ? 0 : 1;
} finally {
  clearInterval(cancellation);
  if (ocr && !abort.signal.aborted) await ocr.terminate();
  if (closePdf) await closePdf();
  const lock = join(importRoot(data), "worker.lock");
  if (readJson(lock)?.id === id && readJson(lock)?.pid === process.pid)
    rmSync(lock, { force: true });
}
