import pptxgen from "pptxgenjs";
import sharp from "sharp";
import { join, posix } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { XMLParser } from "fast-xml-parser";
import { readPresentation } from "../../lib/ppt-archive.mjs";
export async function createPptFixture(directory, { large = false } = {}) {
  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = "PMRZokbo synthetic import test";
  ppt.subject = "사용법·테스트용 데모. 실제 기출이 아닙니다.";
  ppt.title = "Synthetic variable-slide question bank";
  const text = (title, body = "") => {
    const slide = ppt.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(title, {
      x: 0.6,
      y: 0.4,
      w: 12,
      h: 1.1,
      fontFace: "Noto Sans CJK KR",
      fontSize: 27,
      color: "234834",
      bold: true,
    });
    if (body)
      slide.addText(body, {
        x: 0.6,
        y: 1.8,
        w: 12,
        h: 4.8,
        fontFace: "Noto Sans CJK KR",
        fontSize: 22,
        color: "26382F",
        breakLine: false,
      });
    return slide;
  };
  text(
    "PPTX 가져오기 테스트 · 직접 만든 데모",
    "실기출이나 의료 판단용 문항이 아닙니다. 표지 뒤에 4장짜리 문항과 2장짜리 문항이 이어집니다.",
  );
  text(
    "1. 척수손상 후 신경인성 방광 평가 · DEMO",
    "이 문항은 가져오기 기능을 확인하기 위한 데모입니다.\n척수손상 spinal cord injury 및 neurogenic bladder 용어를 분류에 사용합니다.\n화면에 보이는 선지는 이미지를 보존하므로 다시 입력하지 않습니다.\n① 예시 A\n② 예시 B\n③ 예시 C\n④ 예시 D\n⑤ 예시 E",
  );
  text(
    "추가 문제 자료 · 첫 문항의 두 번째 슬라이드",
    "표·그림 등이 다음 장에 이어지는 경우를 재현합니다. 이 슬라이드도 첫 문항의 문제 이미지에 포함되어야 합니다. 임상 정답을 의미하지 않는 데모 자료입니다.",
  );
  text("정답: ③", "직접 만든 테스트 문항입니다.");
  const explanationSlide = text(
    "해설 · 신경인성 방광 DEMO",
    "신경인성 방광, 척수손상, neurogenic bladder, urodynamic 용어를 통해 단원을 추천하는지 확인합니다. 이 문구는 소프트웨어 테스트를 위한 설명이며 임상 판단용 지식이나 실제 시험 해설이 아닙니다.",
  );
  explanationSlide.addNotes(
    "발표자노트: 가져온 해설에서도 보존되는 테스트 문장입니다.",
  );
  const raster = async (lines) =>
    sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="white"/><g fill="#182e21" font-family="Noto Sans CJK KR" font-size="56">${lines.map((s, i) => `<text x="70" y="${100 + i * 100}">${s}</text>`).join("")}</g></svg>`,
      ),
    )
      .png()
      .toBuffer();
  for (const lines of [
    [
      "2. ROTATOR CUFF - SHOULDER DEMO",
      "Image-only slide for local OCR test",
      "A. First choice",
      "B. Second choice",
      "C. Third choice",
      "D. Fourth choice",
      "E. Fifth choice",
    ],
    [
      "Answer: 2",
      "SHOULDER - ROTATOR CUFF",
      "Explanation for synthetic test only",
    ],
  ]) {
    const slide = ppt.addSlide();
    const buffer = await raster(lines);
    slide.addImage({
      data: "image/png;base64," + buffer.toString("base64"),
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
    });
  }
  const file = join(directory, "2023_전문의_1차_1교시_데모.pptx");
  await ppt.writeFile({ fileName: file });
  if (large) {
    const zip = await JSZip.loadAsync(readFileSync(file));
    zip.file("upload-size-fixture.bin", randomBytes(33 * 1024 * 1024), {
      compression: "STORE",
    });
    writeFileSync(
      file,
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    );
  }
  return file;
}

// Original synthetic text only: reproduces repeated headers, highlighted
// answers, late enlarged question figures and disputed reconstructed answers.
export async function createStructuredPptFixture(directory) {
  const ppt = new pptxgen();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = "PMRZokbo synthetic test";
  const add = (number, label, body = "", highlighted = []) => {
    const slide = ppt.addSlide();
    const opts = {
      x: 0.5,
      w: 12,
      h: 0.5,
      fontFace: "Noto Sans CJK KR",
      fontSize: 21,
      color: "234834",
    };
    slide.addText(`${String(number).padStart(2, "0")}번`, { ...opts, y: 0.2 });
    slide.addText(label, { ...opts, y: 0.8 });
    slide.addText("2023 재활의학과 전문의시험 / 2차 1교시 / 척수", {
      ...opts,
      y: 1.4,
      fontSize: 14,
    });
    slide.addText(body || "직접 만든 데모 · 임상·기출 해설이 아닙니다.", {
      ...opts,
      y: 2.1,
      h: 1,
    });
    for (let n = 1; n <= 5; n++)
      slide.addText(`${n}) 가상 선지 ${n}`, {
        ...opts,
        y: 3 + n * 0.6,
        highlight: highlighted.includes(n) ? "BDF27C" : undefined,
      });
    return slide;
  };
  add(1, "문제", "신경인성 방광 · 데모 문제");
  add(1, "정답", "신경인성 방광 · 데모 문제", [3]);
  add(1, "워드 원문 해설 1/2", "답) 3번\n이 문장은 가져오기 테스트용입니다.");
  add(1, "워드 원문 해설 2/2");
  add(1, "문제 그림 확대 1/2", "정답 제출 전에 보여야 하는 가상 그림 자료 A");
  add(
    1,
    "문제 지문·보기 확대 2/2",
    "정답 제출 전에 보여야 하는 가상 그림 자료 B",
  );
  add(1, "근거 대조");
  add(2, "문제", "척수손상 · 데모 문제");
  add(2, "복원 답·이견", "복원 이견 · 가상 자료 A ② / 가상 자료 B ④", [2, 4]);
  add(
    2,
    "워드 원문 해설",
    "답) 2번\n단일 자료의 표기만으로 이견을 없애면 안 됩니다.",
  );
  add(2, "별도 워드의 추가 복원");
  add(2, "근거 대조");
  const file = join(directory, "2023_전문의_2차_1교시_구조데모.pptx");
  await ppt.writeFile({ fileName: file });
  return file;
}

// Test-only PDF writer. Text pages are drawn from the synthetic fixture and
// image-only pages embed its original PNG. No external office program runs.
export async function createPdfFixture(pptxFile, { pageCount } = {}) {
  const slides = await readPresentation(pptxFile),
    zip = await JSZip.loadAsync(readFileSync(pptxFile)),
    pdf = await PDFDocument.create(),
    parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
    });
  const escape = (s) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  for (const slide of slides.slice(0, pageCount ?? slides.length)) {
    let png;
    if (slide.text.trim()) {
      const lines = slide.text
        .split("\n")
        .flatMap((line) =>
          Array.from(
            { length: Math.max(1, Math.ceil(line.length / 52)) },
            (_, i) => line.slice(i * 52, (i + 1) * 52),
          ),
        )
        .slice(0, 18);
      png = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="white"/><g font-family="Noto Sans CJK KR" font-size="34" fill="#182e21">${lines.map((s, i) => `<text x="55" y="${58 + i * 45}">${escape(s)}</text>`).join("")}</g></svg>`,
        ),
      )
        .png()
        .toBuffer();
    } else {
      const xml = await zip
        .file(`ppt/slides/slide${slide.number}.xml`)
        .async("string");
      const embed = xml.match(/<a:blip\b[^>]*r:embed="([^"]+)"/)[1];
      const rels = parser.parse(
        await zip
          .file(`ppt/slides/_rels/slide${slide.number}.xml.rels`)
          .async("string"),
      ).Relationships.Relationship;
      const rel = (Array.isArray(rels) ? rels : [rels]).find(
        (r) => r["@Id"] === embed,
      );
      const image = await zip
        .file(posix.normalize(posix.join("ppt/slides", rel["@Target"])))
        .async("nodebuffer");
      png = await sharp(image).png().toBuffer();
    }
    const embedded = await pdf.embedPng(png),
      page = pdf.addPage([960, 540]);
    page.drawImage(embedded, { x: 0, y: 0, width: 960, height: 540 });
  }
  const path = pptxFile.replace(
    /\.pptx$/i,
    pageCount === undefined ? ".pdf" : `-${pageCount}pages.pdf`,
  );
  writeFileSync(path, await pdf.save());
  return path;
}
