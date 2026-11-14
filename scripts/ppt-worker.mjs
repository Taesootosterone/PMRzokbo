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
import { convertNativePresentation } from "../lib/ppt-native.mjs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
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
  const renderMode = job.renderMode || "native";
  saveJob(dir, {
    phase: "analyzing",
    progress: 0,
    pid: process.pid,
    renderMode,
  });
  const slides = await readPresentation(join(dir, "source.pptx"));
  let conversionWarnings = [];
  if (renderMode === "pdf" && !existsSync(join(dir, "render-input.pdf"))) {
    saveJob(dir, {
      phase: "awaiting-pdf",
      totalSlides: slides.length,
      completedSlides: 0,
      slides,
      candidates: [],
      progress: 0,
      error: null,
    });
  } else {
    saveJob(dir, {
      phase: "rendering",
      totalSlides: slides.length,
      completedSlides: 0,
    });
    let file;
    if (renderMode === "native") {
      saveJob(dir, { phase: "converting", progress: 0, convertedSlides: 0 });
      const result = await convertNativePresentation(
        dir,
        slides,
        abort.signal,
        (done, total) => {
          saveJob(dir, {
            phase: "converting",
            convertedSlides: done,
            progress: Math.round((done / total) * 40),
          });
        },
      );
      file = result.file;
      conversionWarnings = result.warnings;
    } else
      file =
        renderMode === "pdf"
          ? join(dir, "render-input.pdf")
          : await convertPresentation(dir, abort.signal);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    saveJob(dir, {
      phase: "rendering",
      pdfReady: true,
      pdfSha256: hash.digest("hex"),
      pdfFilename:
        renderMode === "pdf"
          ? job.pdfFilename
          : job.filename.replace(/\.pptx$/i, ".pdf"),
      conversionWarnings,
    });
    const document = await openPdf(file);
    pdf = document.pdf;
    closePdf = document.destroy;
    if (pdf.numPages !== slides.length)
      throw new Error(
        `PPT는 ${slides.length}장인데 PDF는 ${pdf.numPages}페이지입니다. 같은 PPT에서 슬라이드 한 장을 한 페이지로, 숨김 슬라이드까지 포함해 PDF로 저장하세요.`,
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
          progress:
            (renderMode === "native" ? 40 : 0) +
            Math.round(
              (i / slides.length) * (renderMode === "native" ? 55 : 95),
            ),
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
        progress:
          (renderMode === "native" ? 40 : 0) +
          Math.round(
            ((i + 1) / slides.length) * (renderMode === "native" ? 55 : 95),
          ),
      });
    }
    const grouped = groupSlides(slides, { mode: "auto" }, job.metadata);
    saveJob(dir, {
      ...grouped,
      warnings: [...conversionWarnings, ...grouped.warnings],
      reviewDrafts: null,
      slides,
      ocrCount,
      phase: "ready",
      progress: 100,
      completedSlides: slides.length,
      error: null,
    });
  }
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
