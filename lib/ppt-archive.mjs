import yauzl from "yauzl";
import { XMLParser } from "fast-xml-parser";
import { posix } from "node:path";
import { MAX_SLIDES, slideHeader } from "./ppt-model.mjs";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  processEntities: false,
});
const array = (value) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
function xml(buffer) {
  const text = buffer.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("지원하지 않는 XML 선언입니다.");
  return parser.parse(text);
}
function texts(node) {
  if (!node || typeof node !== "object") return [];
  const output = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "a:p") {
      for (const para of array(value)) output.push(texts(para).join(""));
    } else if (key === "a:t")
      output.push(
        ...array(value).map((v) =>
          typeof v === "object" ? String(v["#text"] || "") : String(v),
        ),
      );
    else if (!key.startsWith("@"))
      for (const child of array(value))
        if (typeof child === "object") output.push(...texts(child));
  }
  return output;
}
function relations(buffer) {
  const root = xml(buffer);
  return array(root.Relationships?.Relationship);
}
function noteText(parsed) {
  const shapes = array(parsed["p:notes"]?.["p:cSld"]?.["p:spTree"]?.["p:sp"]);
  return shapes
    .filter(
      (s) =>
        !["sldNum", "hdr", "ftr", "dt", "sldImg"].includes(
          s["p:nvSpPr"]?.["p:nvPr"]?.["p:ph"]?.["@type"],
        ),
    )
    .flatMap(texts)
    .join("\n");
}
function highlightedChoices(parsed) {
  const choices = new Set();
  function hasHighlight(node) {
    if (!node || typeof node !== "object") return false;
    return Object.entries(node).some(
      ([key, value]) => key === "a:highlight" || hasHighlight(value),
    );
  }
  function visit(node) {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "a:p")
        for (const p of array(value)) {
          if (!hasHighlight(p)) continue;
          const match = texts(p)
            .join("")
            .trim()
            .match(/^(?:([1-5])\s*[.)번]|([①②③④⑤])|([A-E])\s*[.)])\s*\S/i);
          if (match)
            choices.add(
              match[1]
                ? Number(match[1])
                : match[2]
                  ? "①②③④⑤".indexOf(match[2]) + 1
                  : match[3].toUpperCase().charCodeAt(0) - 64,
            );
        }
      else if (!key.startsWith("@"))
        for (const child of array(value)) visit(child);
    }
  }
  visit(parsed);
  return [...choices].sort();
}
function nativeHints(parsed) {
  const highlights = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node["p:nvSpPr"] && node["p:txBody"]) {
      const shape = node["p:nvSpPr"]["p:cNvPr"] || {};
      array(node["p:txBody"]["a:p"]).forEach((p, paragraph) => {
        const fallback = p["a:pPr"]?.["a:defRPr"]?.["a:highlight"];
        const runs = array(p["a:r"]).map((r) => ({
          text: texts(r).join(""),
          color: (r["a:rPr"]?.["a:highlight"] || fallback)?.["a:srgbClr"]?.[
            "@val"
          ],
        }));
        if (runs.some((r) => r.color))
          highlights.push({
            id: String(shape["@id"]),
            name: shape["@name"],
            paragraph,
            runs,
          });
      });
    }
    for (const [key, value] of Object.entries(node))
      if (!key.startsWith("@"))
        for (const child of array(value))
          if (typeof child === "object") visit(child);
  }
  visit(parsed);
  return highlights;
}
export async function readPresentation(file) {
  const entries = new Map();
  let size = 0,
    count = 0;
  await new Promise((resolve, reject) =>
    yauzl.open(
      file,
      { lazyEntries: true, validateEntrySizes: true, autoClose: true },
      (error, zip) => {
        if (error)
          return reject(
            new Error(
              "PPTX 파일을 열지 못했습니다. 암호화되지 않은 .pptx를 사용하세요.",
            ),
          );
        let failed = false;
        const fail = (err) => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(err);
        };
        zip.on("error", fail);
        zip.on("end", resolve);
        zip.on("entry", (entry) => {
          const name = entry.fileName;
          size += entry.uncompressedSize;
          count++;
          if (
            count > 30000 ||
            size > 1024 * 1024 * 1024 ||
            entry.generalPurposeBitFlag & 1 ||
            name.startsWith("/") ||
            name.split("/").includes("..") ||
            name.includes("\\") ||
            ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
          )
            return fail(
              new Error("파일 경로·암호화·압축 크기 제한을 확인하세요."),
            );
          if (/vbaProject\.bin$/i.test(name))
            return fail(
              new Error(
                "매크로가 포함된 파일은 지원하지 않습니다. 일반 PPTX로 저장하세요.",
              ),
            );
          if (
            !/^(?:ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels|ppt\/slides\/slide\d+\.xml|ppt\/slides\/_rels\/slide\d+\.xml\.rels|ppt\/notesSlides\/notesSlide\d+\.xml)$/.test(
              name,
            )
          ) {
            zip.readEntry();
            return;
          }
          if (entry.uncompressedSize > 5 * 1024 * 1024)
            return fail(
              new Error("슬라이드 XML이 너무 큽니다. 파일을 나누어 주세요."),
            );
          zip.openReadStream(entry, (e, stream) => {
            if (e) return fail(e);
            const chunks = [];
            stream.on("data", (b) => chunks.push(b));
            stream.on("error", fail);
            stream.on("end", () => {
              if (!failed) {
                entries.set(name, Buffer.concat(chunks));
                zip.readEntry();
              }
            });
          });
        });
        zip.readEntry();
      },
    ),
  );
  if (
    !entries.has("ppt/presentation.xml") ||
    !entries.has("ppt/_rels/presentation.xml.rels")
  )
    throw new Error("PowerPoint 슬라이드 구조를 찾지 못했습니다.");
  const presentation = xml(entries.get("ppt/presentation.xml")),
    rels = relations(entries.get("ppt/_rels/presentation.xml.rels"));
  const ids = array(
    presentation["p:presentation"]?.["p:sldIdLst"]?.["p:sldId"],
  );
  if (!ids.length || ids.length > MAX_SLIDES)
    throw new Error(
      `PPTX는 1~${MAX_SLIDES}장까지 처리합니다. 파일을 나누어 주세요.`,
    );
  return ids.map((id, index) => {
    const rel = rels.find((r) => r["@Id"] === id["@r:id"]);
    if (!rel || rel["@TargetMode"] === "External")
      throw new Error("슬라이드 연결 형식을 확인하세요.");
    const name = posix.normalize(posix.join("ppt", rel["@Target"]));
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name) || !entries.has(name))
      throw new Error("슬라이드 순서 정보를 읽지 못했습니다.");
    const parsed = xml(entries.get(name)),
      relationName = "ppt/slides/_rels/" + posix.basename(name) + ".rels";
    let notes = "";
    if (entries.has(relationName))
      for (const r of relations(entries.get(relationName))) {
        if (
          r["@TargetMode"] === "External" &&
          !/\/hyperlink$/.test(r["@Type"] || "")
        )
          throw new Error(
            "외부 파일을 참조하는 슬라이드는 지원하지 않습니다. 이미지를 파일 안에 포함해 저장하세요.",
          );
        if (/\/notesSlide$/.test(r["@Type"] || "")) {
          const note = posix.normalize(posix.join("ppt/slides", r["@Target"]));
          if (entries.has(note)) notes = noteText(xml(entries.get(note)));
        }
      }
    const text = texts(parsed).join("\n");
    const rawSlide = entries.get(name).toString("utf8");
    const nativeUnsupported = [
      [/\bc:chart\b/, "차트"],
      [/\bdgm:relIds\b/, "SmartArt"],
      [/\bm:oMath\b/, "수식"],
      [/\bp:oleObj\b/, "삽입 개체(OLE)"],
      [/\ba:videoFile\b|\bp:video\b/, "동영상"],
      [/<p:grpSp(?:\s|>)/, "그룹 도형"],
      [
        /\b(?:gridSpan|rowSpan)=["'](?:[2-9]\d*|1\d+)["']|\b(?:hMerge|vMerge)=["'](?:1|true)["']/,
        "병합 표",
      ],
    ]
      .filter(([pattern]) => pattern.test(rawSlide))
      .map(([, label]) => label);
    return {
      number: index + 1,
      part: name,
      text,
      header: slideHeader(text),
      highlightedChoices: highlightedChoices(parsed),
      nativeHighlights: nativeHints(parsed),
      nativeCrops: array(parsed["p:sld"]?.["p:cSld"]?.["p:spTree"]?.["p:pic"])
        .filter((p) => p["p:blipFill"]?.["a:srcRect"])
        .map((p) => ({
          id: String(p["p:nvPicPr"]?.["p:cNvPr"]?.["@id"]),
          ...Object.fromEntries(
            ["l", "t", "r", "b"].map((k) => [
              k,
              Number(p["p:blipFill"]["a:srcRect"]["@" + k] || 0) / 100000,
            ]),
          ),
        })),
      nativeUnsupported,
      notes,
      hidden: parsed["p:sld"]?.["@show"] === "0",
    };
  });
}
