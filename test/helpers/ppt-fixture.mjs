import pptxgen from "pptxgenjs";
import sharp from "sharp";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import JSZip from "jszip";
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
