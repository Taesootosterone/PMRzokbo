import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

export function officeBinary(env = process.env) {
  const candidates = [
    env.PMRZ_LIBREOFFICE_BIN,
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
    ...String(env.PATH || "")
      .split(":")
      .map((p) => join(p, "soffice")),
    "/usr/bin/libreoffice",
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}
export function pptCapabilities() {
  return {
    available: true,
    officeAvailable: !!officeBinary(),
    ocr: true,
    maxBytes: 256 * 1024 * 1024,
    renderer: "PDF",
    downloadUrl: "https://www.libreoffice.org/download/download-libreoffice/",
  };
}
export async function composeSlides(dir, pages) {
  const images = [];
  let height = 0;
  for (const n of pages) {
    const dimensions = await sharp(join(dir, "slides", `${n}.png`)).metadata();
    if (
      !dimensions.width ||
      !dimensions.height ||
      1400 *
        (height + Math.ceil((dimensions.height * 1400) / dimensions.width)) >
        38_000_000
    )
      throw new Error(
        "한 문항에 너무 많은 슬라이드가 있습니다. 문항 묶음을 나누어 주세요.",
      );
    const buffer = await sharp(join(dir, "slides", `${n}.png`))
      .resize({ width: 1400 })
      .png()
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    images.push({ input: buffer, left: 0, top: height });
    height += meta.height + 18;
  }
  height -= 18;
  if (height < 1 || 1400 * height > 38_000_000)
    throw new Error(
      "한 문항에 너무 많은 슬라이드가 있습니다. 문항 묶음을 나누어 주세요.",
    );
  let result = await sharp({
    create: { width: 1400, height, channels: 3, background: "#eeeeec" },
  })
    .composite(images)
    .png()
    .toBuffer();
  if (result.length > 12 * 1024 * 1024)
    result = await sharp(result).jpeg({ quality: 90 }).toBuffer();
  if (result.length > 12 * 1024 * 1024)
    throw new Error(
      "문항 이미지가 12MB를 넘습니다. 슬라이드 묶음을 줄여 주세요.",
    );
  return result;
}
