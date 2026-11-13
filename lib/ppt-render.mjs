import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { officeBinary } from "./ppt-local.mjs";
import sharp from "sharp";
const require = createRequire(import.meta.url);
export async function convertPresentation(dir, signal) {
  const binary = officeBinary();
  if (!binary)
    throw new Error(
      "LibreOffice를 한 번 설치해야 PPT 화면을 이미지로 보존할 수 있습니다. /Applications/LibreOffice.app에 설치한 뒤 다시 분석하세요.",
    );
  const output = join(dir, "render"),
    profile = join(dir, "office-profile");
  mkdirSync(output, { recursive: true });
  mkdirSync(join(profile, "user"), { recursive: true });
  writeFileSync(
    join(profile, "user", "registrymodifications.xcu"),
    '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>',
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--convert-to",
        'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}',
        "--outdir",
        output,
        join(dir, "source.pptx"),
      ],
      { stdio: "ignore", detached: process.platform !== "win32" },
    );
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      error ? reject(error) : resolve();
    };
    const stop = () => {
      try {
        if (process.platform === "win32") child.kill("SIGKILL");
        else process.kill(-child.pid, "SIGKILL");
      } catch {}
      finish(
        new Error(
          signal?.aborted
            ? "분석을 중지했습니다."
            : "PPT 변환 시간이 초과되었습니다. 파일을 나누어 주세요.",
        ),
      );
    };
    const timer = setTimeout(stop, 8 * 60 * 1000);
    timer.unref();
    signal?.addEventListener("abort", stop, { once: true });
    child.once("error", () =>
      finish(
        new Error(
          "LibreOffice 실행에 실패했습니다. 설치 경로와 실행 권한을 확인하세요.",
        ),
      ),
    );
    child.once("exit", (code) =>
      finish(
        code
          ? new Error(
              "PPT 화면 변환에 실패했습니다. PowerPoint에서 새 .pptx로 저장해 다시 시도하세요.",
            )
          : null,
      ),
    );
    if (signal?.aborted) stop();
  });
  const file = join(output, "source.pdf");
  if (!existsSync(file))
    throw new Error(
      "PPT 화면 PDF가 생성되지 않았습니다. LibreOffice 설치와 파일 상태를 확인하세요.",
    );
  return file;
}
export async function openPdf(file) {
  const canvas = await import("@napi-rs/canvas");
  for (const key of ["DOMMatrix", "ImageData", "Path2D"])
    if (!globalThis[key]) globalThis[key] = canvas[key];
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = dirname(require.resolve("pdfjs-dist/package.json"));
  const loading = getDocument({
    data: new Uint8Array(readFileSync(file)),
    useSystemFonts: true,
    isEvalSupported: false,
    standardFontDataUrl: join(root, "standard_fonts") + "/",
    cMapUrl: join(root, "cmaps") + "/",
    cMapPacked: true,
  });
  const pdf = await loading.promise;
  return { pdf, canvas, destroy: () => loading.destroy() };
}
export async function renderSlide(pdf, canvas, pageNumber, dir) {
  const page = await pdf.getPage(pageNumber),
    base = page.getViewport({ scale: 1 }),
    viewport = page.getViewport({ scale: 1600 / base.width });
  const image = canvas.createCanvas(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  await page.render({
    canvas: image,
    canvasContext: image.getContext("2d"),
    viewport,
  }).promise;
  const png = await image.encode("png");
  mkdirSync(join(dir, "slides"), { recursive: true });
  mkdirSync(join(dir, "thumbs"), { recursive: true });
  writeFileSync(join(dir, "slides", `${pageNumber}.png`), png, { mode: 0o600 });
  writeFileSync(
    join(dir, "thumbs", `${pageNumber}.jpg`),
    await sharp(png).resize({ width: 300 }).jpeg({ quality: 72 }).toBuffer(),
    { mode: 0o600 },
  );
  const text = (await page.getTextContent()).items
    .map((item) => item.str || "")
    .join("\n");
  page.cleanup();
  return { png, text };
}
export async function createOcr(dataRoot) {
  const langDir = join(dataRoot, "ocr-languages");
  mkdirSync(langDir, { recursive: true, mode: 0o700 });
  for (const lang of ["kor", "eng"]) {
    const pkg = require(`@tesseract.js-data/${lang}`),
      folder = pkg.langPath;
    const source = join(folder, `${lang}.traineddata.gz`);
    if (!existsSync(source))
      throw new Error(
        `OCR 언어 자료(${lang})를 찾지 못했습니다. 앱을 다시 업데이트하세요.`,
      );
    const destination = join(langDir, `${lang}.traineddata.gz`);
    if (!existsSync(destination)) copyFileSync(source, destination);
  }
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["eng", "kor"], 1, {
    langPath: langDir,
    cachePath: langDir,
    gzip: true,
    workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
  });
  await worker.setParameters({
    tessedit_pageseg_mode: "11",
    preserve_interword_spaces: "1",
  });
  return worker;
}
