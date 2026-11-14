import { createRequire } from "node:module";
import {
  readFileSync,
  createWriteStream,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { createCanvas, loadImage, GlobalFonts, Path2D } from "@napi-rs/canvas";
import { parseDocument } from "htmlparser2";
import PDFDocument from "pdfkit";
import JSZip from "jszip";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const require = createRequire(import.meta.url);
const { parse } = require("pptxtojson/dist/index.cjs");
const fontFile = fileURLToPath(
  new URL("../assets/fonts/NotoSansKR.ttf", import.meta.url),
);
const FAMILY = "PMR Noto KR";
let registered = false;
const wordSegments = new Intl.Segmenter("ko", { granularity: "word" });
const graphemes = new Intl.Segmenter("ko", { granularity: "grapheme" });
const number = (v, fallback = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : fallback;
const units = (v, fallback = 0, base = 16) => {
  if (v === undefined || v === null || v === "") return fallback;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  // The parser's slide geometry and point-valued text are both in PDF points.
  return String(v).endsWith("pt")
    ? n
    : String(v).endsWith("px")
      ? n * 0.75
      : String(v).endsWith("%")
        ? (n * base) / 100
        : n;
};
const styles = (value) =>
  Object.fromEntries(
    String(value || "")
      .split(";")
      .map((p) => {
        const i = p.indexOf(":");
        return i < 0
          ? []
          : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()];
      })
      .filter((p) => p.length === 2),
  );
const array = (v) => (Array.isArray(v) ? v : []);
function textContent(node) {
  return node?.type === "text"
    ? node.data
    : array(node?.children).map(textContent).join("");
}
function decode(value) {
  return textContent(parseDocument(String(value).replaceAll("<", "&lt;")));
}
const normalized = (text) =>
  decode(text).replaceAll("\u00a0", " ").normalize("NFC");
function unsupported(page, label) {
  throw new Error(
    `${page}번 슬라이드의 ${label}은 내장 PDF 변환에서 지원하지 않습니다. 원본은 보존됩니다. 같은 PPT의 PDF를 추가하면 계속할 수 있습니다.`,
  );
}
function checkAbort(signal) {
  if (signal?.aborted) throw new Error("분석을 중지했습니다.");
}
async function orderedArchive(bytes, slides) {
  const zip = await JSZip.loadAsync(bytes),
    names = Object.keys(zip.files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
  if (
    names.length === slides.length &&
    slides.every((s, i) => s.part === `ppt/slides/slide${i + 1}.xml`)
  )
    return bytes;
  const parts = await Promise.all(
    slides.map(async (s) => ({
      part: s.part,
      xml: await zip.file(s.part).async("nodebuffer"),
      rels: await zip
        .file(s.part.replace("/slides/", "/slides/_rels/") + ".rels")
        ?.async("nodebuffer"),
    })),
  );
  for (const name of Object.keys(zip.files))
    if (/^ppt\/slides\/(?:_rels\/)?slide\d+\.xml(?:\.rels)?$/.test(name))
      zip.remove(name);
  parts.forEach((p, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, p.xml);
    if (p.rels) zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, p.rels);
  });
  const options = { ignoreAttributes: false, attributeNamePrefix: "@" };
  const rels = new XMLParser(options).parse(
    await zip.file("ppt/_rels/presentation.xml.rels").async("string"),
  );
  const mapping = new Map(
    parts.map((p, i) => [
      p.part.replace(/^ppt\//, ""),
      `slides/slide${i + 1}.xml`,
    ]),
  );
  rels.Relationships.Relationship = []
    .concat(rels.Relationships.Relationship || [])
    .filter((r) => {
      if (!/\/slide$/.test(r["@Type"] || "")) return true;
      const target = mapping.get(r["@Target"]);
      if (!target) return false;
      r["@Target"] = target;
      return true;
    });
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    new XMLBuilder(options).build(rels),
  );
  const types = new XMLParser(options).parse(
    await zip.file("[Content_Types].xml").async("string"),
  );
  types.Types.Override = []
    .concat(types.Types.Override || [])
    .filter(
      (o) => !/^\/ppt\/slides\/slide\d+\.xml$/.test(o["@PartName"] || ""),
    );
  for (let i = 0; i < slides.length; i++)
    types.Types.Override.push({
      "@PartName": `/ppt/slides/slide${i + 1}.xml`,
      "@ContentType":
        "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
    });
  zip.file("[Content_Types].xml", new XMLBuilder(options).build(types));
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  });
}

function paragraphs(html, hints = []) {
  const result = [];
  let paragraph = null;
  function start(style = {}) {
    paragraph = { style, runs: [] };
    result.push(paragraph);
  }
  function walk(node, inherited = {}) {
    if (node.type === "text") {
      if (!paragraph) start();
      paragraph.runs.push({
        text: node.data.normalize("NFC"),
        style: inherited,
      });
      return;
    }
    if (["script", "style", "iframe"].includes(node.name)) return;
    const style = { ...inherited, ...styles(node.attribs?.style) };
    if (["b", "strong"].includes(node.name)) style["font-weight"] = "bold";
    if (["i", "em"].includes(node.name)) style["font-style"] = "italic";
    if (node.name === "u") style["text-decoration"] = "underline";
    if (node.name === "br") {
      if (!paragraph) start();
      paragraph.runs.push({ text: "\n", style });
      return;
    }
    const block = ["p", "div", "li"].includes(node.name);
    if (block) start(style);
    for (const child of array(node.children)) walk(child, style);
    if (block) paragraph = null;
  }
  for (const node of parseDocument(html || "").children) walk(node);
  for (const hint of hints) {
    const p = result[hint.paragraph];
    if (!p) continue;
    const plain = p.runs.map((r) => r.text.replaceAll("\u00a0", " ")).join("");
    let position = 0;
    const ranges = [];
    for (const run of hint.runs) {
      const value = normalized(run.text),
        start = plain.indexOf(value, position);
      if (start < 0) continue;
      if (run.color && /^[A-Fa-f0-9]{6}$/.test(run.color))
        ranges.push({
          start,
          end: start + value.length,
          color: "#" + run.color,
        });
      position = start + value.length;
    }
    let offset = 0;
    p.runs = p.runs.flatMap((run) => {
      const a = offset,
        b = a + run.text.length;
      offset = b;
      const cuts = [
        ...new Set([
          a,
          b,
          ...ranges
            .flatMap((r) => [Math.max(a, r.start), Math.min(b, r.end)])
            .filter((c) => c > a && c < b),
        ]),
      ].sort((x, y) => x - y);
      return cuts.slice(0, -1).map((c, i) => ({
        text: run.text.slice(c - a, cuts[i + 1] - a),
        style: {
          ...run.style,
          ...(ranges.find((r) => r.start <= c && r.end > c)
            ? {
                "background-color": ranges.find(
                  (r) => r.start <= c && r.end > c,
                ).color,
              }
            : {}),
        },
      }));
    });
  }
  return result;
}
function font(ctx, style, report) {
  const size = units(style["font-size"], 18),
    weight = style["font-weight"] || "normal";
  const original = String(style["font-family"] || "").replace(/["']/g, "");
  if (original && !/Noto Sans (?:CJK KR|KR)/i.test(original))
    report.fonts.add(original);
  ctx.font = `${style["font-style"] === "italic" ? "italic " : ""}${weight} ${size}px "${FAMILY}"`;
  return size;
}
function layoutText(ctx, ps, width, wrap, report) {
  const output = [];
  for (const p of ps) {
    const indent = units(p.style["margin-left"]),
      right = units(p.style["margin-right"]);
    const available = Math.max(1, width - indent - right),
      lines = [];
    let line = { runs: [], width: 0, size: 0 };
    const flush = () => {
      lines.push(line);
      line = { runs: [], width: 0, size: 0 };
    };
    function append(text, style) {
      const size = font(ctx, style, report),
        w = ctx.measureText(text).width;
      if (wrap && line.width + w > available + 0.1 && line.runs.length) flush();
      if (wrap && w > available && text.length > 1) {
        for (const item of graphemes.segment(text)) append(item.segment, style);
        return;
      }
      line.runs.push({ text, style, width: w, size });
      line.width += w;
      line.size = Math.max(line.size, size);
    }
    for (const run of p.runs)
      for (const [i, part] of run.text.split("\n").entries()) {
        if (i) flush();
        for (const token of wrap
          ? [...wordSegments.segment(part)].map((t) => t.segment)
          : [part])
          if (token) append(token, run.style);
      }
    if (line.runs.length || !lines.length) flush();
    for (const [i, l] of lines.entries()) {
      const fs = l.size || 18,
        v = p.style["line-height"];
      l.height = v
        ? /^[\d.]+$/.test(v)
          ? Number(v) * fs
          : units(v, fs * 1.2, fs)
        : fs * 1.2;
      l.height = Math.max(fs, l.height);
      output.push({
        ...l,
        indent,
        available,
        align: p.style["text-align"] || "left",
        before: i === 0 ? units(p.style["margin-top"]) : 0,
        after: i === lines.length - 1 ? units(p.style["margin-bottom"]) : 0,
      });
    }
  }
  return output;
}
function drawText(ctx, element, report, hints) {
  if (!element.content) return;
  const inset = element.textInset || {},
    left = number(inset.l),
    top = number(inset.t),
    right = number(inset.r),
    bottom = number(inset.b);
  const width = Math.max(1, element.width - left - right),
    height = element.height - top - bottom;
  const lines = layoutText(
    ctx,
    paragraphs(element.content, hints),
    width,
    element.wrap !== false,
    report,
  );
  const allHeight = lines.reduce(
    (n, l) => n + l.height + l.before + l.after,
    0,
  );
  let y =
    top +
    (element.vAlign === "mid"
      ? Math.max(0, (height - allHeight) / 2)
      : element.vAlign === "down"
        ? Math.max(0, height - allHeight)
        : 0);
  for (const line of lines) {
    y += line.before;
    let x =
      left +
      line.indent +
      (line.align === "center"
        ? (line.available - line.width) / 2
        : line.align === "right"
          ? line.available - line.width
          : 0);
    for (const run of line.runs) {
      const size = font(ctx, run.style, report),
        baseline = y + (line.height - size) / 2 + size * 0.88;
      const bg = run.style["background-color"] || run.style.background;
      if (bg && bg !== "transparent") {
        ctx.fillStyle = bg;
        ctx.fillRect(x, baseline - size * 0.88, run.width, size * 1.15);
      }
      ctx.fillStyle = run.style.color || "#111111";
      ctx.fillText(run.text, x, baseline);
      const decoration = run.style["text-decoration"] || "";
      if (/underline|line-through/.test(decoration)) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(0.5, size / 18);
        ctx.beginPath();
        const yy =
          baseline +
          (/line-through/.test(decoration) ? -size * 0.32 : size * 0.1);
        ctx.moveTo(x, yy);
        ctx.lineTo(x + run.width, yy);
        ctx.stroke();
      }
      x += run.width;
    }
    y += line.height + line.after;
  }
}
async function dataImage(value, page) {
  if (
    typeof value !== "string" ||
    !/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|bmp);base64,/i.test(value)
  )
    unsupported(page, "이미지 형식");
  const buffer = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  if (buffer.length > 64 * 1024 * 1024)
    unsupported(page, "64MB 초과 단일 이미지");
  if (
    /^data:image\/svg/i.test(value) &&
    /<!DOCTYPE|<!ENTITY|(?:href|url)\s*[=(]\s*["']?(?:https?:|file:)/i.test(
      buffer.toString("utf8"),
    )
  )
    unsupported(page, "외부 참조 SVG");
  return loadImage(buffer);
}
async function fill(ctx, value, w, h, page) {
  if (!value) return false;
  if (typeof value === "string") {
    ctx.fillStyle = value;
    return true;
  }
  if (value.type === "color") {
    ctx.fillStyle = value.value;
    return true;
  }
  if (value.type === "image") {
    const image = await dataImage(
      value.value?.base64 || value.value || value.base64,
      page,
    );
    ctx.drawImage(image, 0, 0, w, h);
    return false;
  }
  // Do not silently lose a background or an unfamiliar fill.
  unsupported(page, `${value.type || "알 수 없는"} 채우기`);
}
function transform(ctx, e) {
  const w = number(e.width),
    h = number(e.height);
  ctx.translate(number(e.left) + w / 2, number(e.top) + h / 2);
  ctx.rotate((number(e.rotate) * Math.PI) / 180);
  ctx.scale(e.isFlipH ? -1 : 1, e.isFlipV ? -1 : 1);
  ctx.translate(-w / 2, -h / 2);
}
async function drawElement(ctx, e, page, report, source) {
  const w = number(e.width),
    h = number(e.height);
  if (!Number.isFinite(w + h) || w < 0 || h < 0)
    unsupported(page, "잘못된 도형 크기");
  ctx.save();
  transform(ctx, e);
  try {
    if (e.type === "image") {
      if (e.geom && !["rect", "ellipse", "roundRect"].includes(e.geom))
        unsupported(page, `이미지 자르기(${e.geom})`);
      if (e.geom === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.clip();
      }
      if (e.geom === "roundRect") {
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, Math.min(w, h) * 0.1);
        ctx.clip();
      }
      const image = await dataImage(e.base64, page),
        r =
          source.nativeCrops?.find((c) => c.id === String(e.id)) ||
          e.range ||
          e.crop;
      if (r) {
        const l = number(r.left ?? r.l),
          t = number(r.top ?? r.t),
          rr = number(r.right ?? r.r),
          b = number(r.bottom ?? r.b);
        if (
          [l, t, rr, b].some((v) => v < 0 || v >= 1) ||
          l + rr >= 1 ||
          t + b >= 1
        )
          unsupported(page, "이미지 자르기 범위");
        ctx.drawImage(
          image,
          l * image.width,
          t * image.height,
          (1 - l - rr) * image.width,
          (1 - t - b) * image.height,
          0,
          0,
          w,
          h,
        );
      } else ctx.drawImage(image, 0, 0, w, h);
    } else if (e.type === "shape" || e.type === "text") {
      if (e.type === "shape" && !e.path && e.shapType && e.shapType !== "rect")
        unsupported(page, `${e.shapType} 도형`);
      let path;
      try {
        path = new Path2D(e.path || `M0 0H${w}V${h}H0Z`);
      } catch {
        unsupported(page, "도형 경로");
      }
      ctx.save();
      const vb = e.pathViewBox;
      if (vb?.width && vb?.height) {
        ctx.scale(w / vb.width, h / vb.height);
        ctx.translate(-number(vb.x), -number(vb.y));
      }
      if (await fill(ctx, e.fill, w, h, page)) ctx.fill(path);
      if (number(e.borderWidth) > 0) {
        ctx.strokeStyle = e.borderColor || "#000";
        ctx.lineWidth = e.borderWidth;
        if (e.borderType === "dash")
          ctx.setLineDash([e.borderWidth * 4, e.borderWidth * 3]);
        ctx.stroke(path);
      }
      ctx.restore();
      const hints = (source.nativeHighlights || []).filter(
        (h) => h.id === String(e.id) || h.name === e.name,
      );
      drawText(ctx, e, report, hints);
    } else if (e.type === "table") {
      await drawTable(ctx, e, page, report);
    } else if (e.type === "group") {
      unsupported(page, "그룹 도형");
    } else unsupported(page, e.type || "알 수 없는 개체");
  } finally {
    ctx.restore();
  }
}
async function drawTable(ctx, e, page, report) {
  if (!Array.isArray(e.data) || !e.data.length || !Array.isArray(e.data[0]))
    unsupported(page, "표 구조");
  const rows = e.data.length,
    cols = e.data[0].length;
  const widths =
      e.colWidths?.length === cols
        ? e.colWidths
        : Array(cols).fill(e.width / cols),
    heights =
      e.rowHeights?.length === rows
        ? e.rowHeights
        : Array(rows).fill(e.height / rows);
  let y = 0;
  for (let r = 0; r < rows; r++) {
    let x = 0;
    for (let c = 0; c < cols; c++) {
      const cell = e.data[r][c],
        w = widths[c],
        h = heights[r];
      if (cell?.rowSpan > 1 || cell?.colSpan > 1) unsupported(page, "병합 표");
      ctx.save();
      ctx.translate(x, y);
      const cellFill = cell?.fillColor || cell?.fill;
      if (
        cellFill &&
        (await fill(
          ctx,
          typeof cellFill === "string"
            ? { type: "color", value: cellFill }
            : cellFill,
          w,
          h,
          page,
        ))
      )
        ctx.fillRect(0, 0, w, h);
      for (const [side, a, b] of [
        ["top", [0, 0], [w, 0]],
        ["right", [w, 0], [w, h]],
        ["bottom", [0, h], [w, h]],
        ["left", [0, 0], [0, h]],
      ]) {
        const border = cell?.borders?.[side] || e.borders?.[side];
        if (border && number(border.borderWidth) > 0) {
          ctx.strokeStyle = border.borderColor || "#777";
          ctx.lineWidth = border.borderWidth;
          ctx.beginPath();
          ctx.moveTo(...a);
          ctx.lineTo(...b);
          ctx.stroke();
        }
      }
      const content =
        typeof cell === "string" ? cell : cell?.text || cell?.content;
      if (typeof content !== "string") unsupported(page, "표 텍스트");
      drawText(
        ctx,
        {
          width: w,
          height: h,
          content,
          wrap: true,
          vAlign: cell?.vAlign || "up",
          textInset: { l: 3, t: 3, r: 3, b: 3 },
        },
        report,
        [],
      );
      ctx.restore();
      x += w;
    }
    y += heights[r];
  }
}

export async function convertNativePresentation(
  dir,
  sourceSlides,
  signal,
  onProgress = () => {},
) {
  checkAbort(signal);
  for (const slide of sourceSlides)
    if (slide.nativeUnsupported?.length)
      unsupported(slide.number, slide.nativeUnsupported.join("·"));
  if (!registered) {
    if (!GlobalFonts.registerFromPath(fontFile, FAMILY))
      throw new Error(
        "내장 한글 글꼴을 읽지 못했습니다. 앱을 다시 업데이트하세요.",
      );
    registered = true;
  }
  onProgress(0, sourceSlides.length, "parse");
  const bytes = await orderedArchive(
    readFileSync(join(dir, "source.pptx")),
    sourceSlides,
  );
  const model = await parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    { imageMode: "base64", videoMode: "none", audioMode: "none" },
  );
  checkAbort(signal);
  if (model.slides.length !== sourceSlides.length)
    throw new Error(
      "내장 변환기의 슬라이드 수가 원본과 다릅니다. 같은 PPT의 PDF를 추가해 주세요.",
    );
  const w = number(model.size?.width),
    h = number(model.size?.height);
  if (w < 1 || h < 1 || (1600 * 1600 * h) / w > 40_000_000)
    throw new Error(
      "슬라이드 크기를 처리할 수 없습니다. 기본 가로/세로 슬라이드로 저장해 주세요.",
    );
  const folder = join(dir, "native");
  mkdirSync(folder, { recursive: true });
  const partial = join(folder, "source.partial.pdf"),
    file = join(folder, "source.pdf");
  const doc = new PDFDocument({
    autoFirstPage: false,
    compress: true,
    bufferPages: false,
    info: {
      Title: "PMRZokbo converted presentation",
      Producer: "PMRZokbo native PDF converter",
    },
  });
  let written = 0;
  const finished = pipeline(
    doc,
    new Transform({
      transform(chunk, encoding, callback) {
        written += chunk.length;
        if (written > 256 * 1024 * 1024)
          return callback(
            new Error(
              "생성한 PDF가 256MB를 넘습니다. PPT를 문항 단위로 나누어 주세요.",
            ),
          );
        callback(null, chunk);
      },
    }),
    createWriteStream(partial, { mode: 0o600 }),
  );
  let outputError;
  finished.catch((e) => {
    outputError = e;
  });
  const report = { fonts: new Set(), pages: sourceSlides.length };
  try {
    const scale = 1600 / w;
    for (let i = 0; i < model.slides.length; i++) {
      checkAbort(signal);
      await yieldLoop();
      checkAbort(signal);
      if (outputError) throw outputError;
      const slide = model.slides[i],
        canvas = createCanvas(1600, Math.ceil(h * scale)),
        ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, w, h);
      if (await fill(ctx, slide.fill, w, h, i + 1)) ctx.fillRect(0, 0, w, h);
      const elements = [
        ...array(slide.layoutElements).sort(
          (a, b) => number(a.order) - number(b.order),
        ),
        ...array(slide.elements).sort(
          (a, b) => number(a.order) - number(b.order),
        ),
      ];
      for (const e of elements)
        await drawElement(ctx, e, i + 1, report, sourceSlides[i]);
      doc.addPage({ size: [w, h], margin: 0 });
      doc.image(await canvas.encode("png"), 0, 0, { width: w, height: h });
      // Release decoded canvas storage before the next page.
      canvas.width = 1;
      canvas.height = 1;
      onProgress(i + 1, model.slides.length, "draw");
    }
    checkAbort(signal);
    doc.end();
    await finished;
    checkAbort(signal);
    renameSync(partial, file);
    return {
      file,
      pages: report.pages,
      warnings: report.fonts.size
        ? [
            `원본의 ${[...report.fonts].slice(0, 6).join(", ")} 글꼴을 내장 Noto Sans KR로 대체했습니다. 미리보기를 확인하세요.`,
          ]
        : [],
    };
  } catch (error) {
    doc.destroy();
    await finished.catch(() => {});
    rmSync(partial, { force: true });
    throw error;
  }
}
