import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import sharp from "sharp";
import { createStructuredPptFixture } from "./helpers/ppt-fixture.mjs";
import { readPresentation } from "../lib/ppt-archive.mjs";
import { convertNativePresentation } from "../lib/ppt-native.mjs";
import { openPdf, renderSlide } from "../lib/ppt-render.mjs";
const hash = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
test("native table cells retain their Korean text and background color", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-native-table-"));
  try {
    const p = new pptxgen();
    p.layout = "LAYOUT_WIDE";
    p.addSlide().addTable(
      [
        ["머리글", "B"],
        ["C", "D"],
      ],
      {
        x: 1,
        y: 1,
        w: 10,
        h: 4,
        fontFace: "Noto Sans CJK KR",
        fontSize: 20,
        fill: "F3F7F5",
        border: { type: "solid", pt: 1, color: "225D4B" },
      },
    );
    const file = join(root, "source.pptx");
    await p.writeFile({ fileName: file });
    const result = await convertNativePresentation(
        root,
        await readPresentation(file),
        new AbortController().signal,
      ),
      d = await openPdf(result.file);
    try {
      await renderSlide(d.pdf, d.canvas, 1, root);
    } finally {
      await d.destroy();
    }
    const pixel = await sharp(join(root, "slides/1.png"))
      .extract({ left: 250, top: 450, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.ok(
      Math.abs(pixel[0] - 243) < 3 &&
        Math.abs(pixel[1] - 247) < 3 &&
        Math.abs(pixel[2] - 245) < 3,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("native PPTX → real PDF preserves page count, Korean, source highlights and the original file", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-native-"));
  try {
    const file = await createStructuredPptFixture(root),
      before = hash(file);
    copyFileSync(file, join(root, "source.pptx"));
    const result = await convertNativePresentation(
      root,
      await readPresentation(file),
      new AbortController().signal,
    );
    assert.equal(hash(file), before);
    assert.equal(readFileSync(result.file).subarray(0, 5).toString(), "%PDF-");
    const d = await openPdf(result.file);
    try {
      assert.equal(d.pdf.numPages, 12);
      await renderSlide(d.pdf, d.canvas, 2, root);
    } finally {
      await d.destroy();
    }
    const { data, info } = await sharp(join(root, "slides/2.png"))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let green = 0;
    for (let i = 0; i < data.length; i += info.channels)
      if (
        Math.abs(data[i] - 189) < 5 &&
        Math.abs(data[i + 1] - 242) < 5 &&
        Math.abs(data[i + 2] - 124) < 5
      )
        green++;
    assert.ok(
      green > 200,
      "answer highlighting must remain visible in the actual PDF pixels",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("native PDF follows presentation order, including image-only slides, rather than ZIP filenames", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-native-order-"));
  try {
    const p = new pptxgen();
    p.layout = "LAYOUT_WIDE";
    for (const color of ["#ef0011", "#1122ee"]) {
      const buffer = await sharp({
        create: { width: 160, height: 90, channels: 3, background: color },
      })
        .png()
        .toBuffer();
      p.addSlide().addImage({
        data: "image/png;base64," + buffer.toString("base64"),
        x: 0,
        y: 0,
        w: 13.333,
        h: 7.5,
      });
    }
    const file = join(root, "source.pptx");
    await p.writeFile({ fileName: file });
    const z = await JSZip.loadAsync(readFileSync(file));
    let xml = await z.file("ppt/presentation.xml").async("string");
    const ids = [...xml.matchAll(/<p:sldId\b[^>]*\/>/g)].map((m) => m[0]);
    assert.equal(ids.length, 2);
    xml = xml.replace(
      /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
      `<p:sldIdLst>${ids.reverse().join("")}</p:sldIdLst>`,
    );
    z.file("ppt/presentation.xml", xml);
    writeFileSync(file, await z.generateAsync({ type: "nodebuffer" }));
    const result = await convertNativePresentation(
        root,
        await readPresentation(file),
        new AbortController().signal,
      ),
      d = await openPdf(result.file);
    try {
      await renderSlide(d.pdf, d.canvas, 1, root);
    } finally {
      await d.destroy();
    }
    const pixel = await sharp(join(root, "slides/1.png"))
      .extract({ left: 800, top: 450, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.ok(
      pixel[2] > 200 && pixel[0] < 40,
      "the blue second slide must be the first PDF page",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("native PDF cancellation removes partial output and preserves the uploaded original", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-native-cancel-"));
  try {
    const file = await createStructuredPptFixture(root);
    copyFileSync(file, join(root, "source.pptx"));
    const before = hash(file),
      abort = new AbortController();
    await assert.rejects(
      convertNativePresentation(
        root,
        await readPresentation(file),
        abort.signal,
        (n) => {
          if (n === 1) abort.abort();
        },
      ),
      /중지/,
    );
    assert.equal(hash(file), before);
    assert.equal(existsSync(join(root, "native/source.partial.pdf")), false);
    assert.equal(existsSync(join(root, "native/source.pdf")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("unsupported native charts and merged tables fail without producing an incomplete PDF", async () => {
  const root = mkdtempSync(join(tmpdir(), "pmrz-native-chart-"));
  try {
    const p = new pptxgen();
    p.addSlide().addChart(
      p.ChartType.bar,
      [{ name: "데모", labels: ["A", "B"], values: [1, 2] }],
      { x: 1, y: 1, w: 6, h: 3 },
    );
    const file = join(root, "source.pptx");
    await p.writeFile({ fileName: file });
    await assert.rejects(
      convertNativePresentation(
        root,
        await readPresentation(file),
        new AbortController().signal,
      ),
      /차트/,
    );
    assert.equal(existsSync(file), true);
    assert.equal(existsSync(join(root, "native/source.pdf")), false);
    const merged = new pptxgen();
    merged
      .addSlide()
      .addTable([[{ text: "병합", options: { colspan: 2 } }], ["A", "B"]], {
        x: 1,
        y: 1,
        w: 6,
        h: 3,
      });
    await merged.writeFile({ fileName: file });
    await assert.rejects(
      convertNativePresentation(
        root,
        await readPresentation(file),
        new AbortController().signal,
      ),
      /병합 표/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
