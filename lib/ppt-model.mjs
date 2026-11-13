import { createHash } from "node:crypto";

export const MAX_PPT_BYTES = 256 * 1024 * 1024;
export const MAX_SLIDES = 1200;
export const normalize = (text) =>
  String(text || "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .trim();
const rules = [
  [
    "척수",
    "신경인성 방광",
    [
      "신경인성 방광",
      "neurogenic bladder",
      "요역동학",
      "urodynamic",
      "배뇨근",
      "detrusor",
    ],
  ],
  [
    "척수",
    "자율신경과반사",
    ["자율신경과반사", "자율신경 과반사", "autonomic dysreflexia"],
  ],
  [
    "척수",
    "척수손상",
    [
      "척수손상",
      "척수 손상",
      "spinal cord injury",
      "ISNCSCI",
      "ASIA impairment",
    ],
  ],
  [
    "뇌신경",
    "뇌졸중",
    ["뇌졸중", "stroke", "편마비", "hemiplegia", "뇌경색", "뇌출혈"],
  ],
  [
    "뇌신경",
    "외상성 뇌손상",
    ["외상성 뇌손상", "traumatic brain injury", "Glasgow coma", "Rancho"],
  ],
  [
    "뇌신경",
    "인지·행동",
    ["인지기능", "인지 기능", "실행증", "실인증", "apraxia", "agnosia"],
  ],
  [
    "연하·언어",
    "연하장애",
    ["연하장애", "연하 장애", "dysphagia", "VFSS", "후두거상", "후두 거상"],
  ],
  ["연하·언어", "언어장애", ["실어증", "aphasia", "구음장애", "dysarthria"]],
  [
    "전기진단",
    "신경전도·근전도",
    [
      "근전도",
      "electromyography",
      "신경전도",
      "nerve conduction",
      "F-wave",
      "H-reflex",
      "CMAP",
      "SNAP",
    ],
  ],
  [
    "말초신경·근육",
    "말초신경병증",
    [
      "수근관",
      "carpal tunnel",
      "포착신경",
      "다발신경",
      "polyneuropathy",
      "비골신경",
      "peroneal nerve",
    ],
  ],
  [
    "말초신경·근육",
    "근육질환",
    [
      "근이영양",
      "muscular dystrophy",
      "근병증",
      "myopathy",
      "중증근무력",
      "myasthenia",
    ],
  ],
  [
    "근골격·통증",
    "척추질환",
    [
      "요추",
      "경추",
      "추간판",
      "신경근병",
      "radiculopathy",
      "lumbar",
      "cervical",
      "척추관협착",
    ],
  ],
  [
    "근골격·통증",
    "어깨·상지",
    [
      "회전근개",
      "rotator cuff",
      "유착성 관절낭",
      "adhesive capsulitis",
      "어깨",
      "shoulder",
    ],
  ],
  [
    "근골격·통증",
    "무릎·하지",
    ["무릎", "knee", "십자인대", "반월상", "meniscus", "고관절", "hip joint"],
  ],
  [
    "근골격·통증",
    "통증치료",
    [
      "복합부위통증",
      "complex regional pain",
      "CRPS",
      "신경병성 통증",
      "neuropathic pain",
    ],
  ],
  ["소아", "뇌성마비", ["뇌성마비", "뇌성 마비", "cerebral palsy", "GMFCS"]],
  [
    "소아",
    "발달·소아재활",
    [
      "발달지연",
      "발달 지연",
      "발달검사",
      "발달 검사",
      "소아재활",
      "developmental delay",
    ],
  ],
  [
    "보조기·의지",
    "의지·절단",
    ["절단", "amputation", "의지 소켓", "prosthetic", "의족", "의수"],
  ],
  [
    "보조기·의지",
    "보조기",
    ["보조기", "orthosis", "orthoses", "AFO", "KAFO", "TLSO"],
  ],
  [
    "보행·운동학",
    "보행분석",
    [
      "보행분석",
      "보행 분석",
      "gait analysis",
      "입각기",
      "유각기",
      "stance phase",
      "swing phase",
    ],
  ],
  [
    "심폐재활",
    "심장재활",
    [
      "심장재활",
      "심장 재활",
      "cardiac rehabilitation",
      "심폐운동",
      "심폐 운동",
      "CPET",
    ],
  ],
  [
    "심폐재활",
    "호흡재활",
    [
      "호흡재활",
      "호흡 재활",
      "pulmonary rehabilitation",
      "호흡근",
      "배담",
      "기침유발",
    ],
  ],
  [
    "노인·기타",
    "림프부종·암재활",
    ["림프부종", "lymphedema", "암재활", "암 재활"],
  ],
  [
    "노인·기타",
    "노인재활",
    ["노쇠", "frailty", "근감소", "sarcopenia", "노인재활"],
  ],
];
const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function matches(text, term) {
  const pattern = /^[a-z0-9 -]+$/i.test(term)
    ? `\\b${escapeRE(term)}\\b`
    : escapeRE(term);
  return new RegExp(pattern, "i").test(text);
}
export function classifyContent(text) {
  const ranked = rules
    .map(([major, minor, terms]) => {
      const hits = terms.filter((t) => matches(text, t));
      return {
        major,
        minor,
        hits,
        score: hits.reduce((n, s) => n + (s.length >= 5 ? 3 : 2), 0),
      };
    })
    .filter((r) => r.score)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length)
    return {
      major: "미분류",
      minor: "분류 확인 필요",
      confidence: "unclassified",
      evidence: [],
      concepts: [],
    };
  const top = ranked[0],
    ambiguous = ranked[1]?.score === top.score;
  return {
    major: top.major,
    minor: top.minor,
    confidence: ambiguous ? "low" : top.score >= 5 ? "high" : "medium",
    evidence: top.hits,
    concepts: [top.minor],
    alternatives: ranked.slice(1, 3).map((r) => `${r.major} → ${r.minor}`),
  };
}
const digits = {
  "①": 1,
  "②": 2,
  "③": 3,
  "④": 4,
  "⑤": 5,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
};
export function detectAnswer(text, { standalone = false } = {}) {
  const values = [],
    evidence = [];
  const raw = String(text || "").split(/\r?\n/),
    lines = [];
  for (let i = 0; i < raw.length; i++) {
    if (
      /^\s*(?:정\s*답|답|correct\s*answer|answer|ans\.?)\s*[:：=은는.\-]*\s*$/i.test(
        raw[i],
      ) &&
      /^\s*[([]?\s*[①②③④⑤1-5A-E]\s*(?:번)?\s*[)\]]?\s*$/i.test(raw[i + 1] || "")
    )
      lines.push(raw[i] + " " + raw[++i]);
    else lines.push(raw[i]);
  }
  for (const line of lines) {
    if (
      /(?:오답|정답이?\s*아[님니]|incorrect answer|not the answer)/i.test(line)
    )
      continue;
    const re =
      /(?:정\s*답|(?:^|\s)답|correct\s*answer|answer|ans\.?)[\s:：=은는\.\-]*(?:번\s*)?[([]?\s*([①②③④⑤1-5A-E])(?:\s*번)?\s*[)\]]?(?=$|[^0-9A-Za-z])/gi;
    for (const m of line.matchAll(re)) {
      const v = digits[m[1].toUpperCase()] || Number(m[1]);
      values.push(v);
      evidence.push(line.trim().slice(0, 220));
      const more = line
        .slice(m.index + m[0].length)
        .match(/^\s*[,/·&와과및]\s*[([]?\s*([①②③④⑤1-5A-E])/i);
      if (more) values.push(digits[more[1].toUpperCase()] || Number(more[1]));
    }
  }
  const single = String(text || "")
    .trim()
    .match(/^[([]?\s*([①②③④⑤1-5])\s*(?:번)?\s*[)\]]?$/);
  if (standalone && single) {
    values.push(digits[single[1]] || Number(single[1]));
    evidence.push(single[0]);
  }
  const unique = [...new Set(values.filter((n) => n >= 1 && n <= 5))];
  return {
    answer: unique.length === 1 ? unique[0] : null,
    evidence: [...new Set(evidence)],
    conflicting: unique.length > 1,
  };
}
export function questionNumber(text) {
  const value = String(text || "")
    .normalize("NFC")
    .trim()
    .slice(0, 250);
  const m = value.match(
    /^(?:\s*(?:문제|문항|Question|Q)\s*[:.#]?\s*)?(?:\[\s*|\(\s*)?(\d{1,3})(?:\s*[\].):번]|\s*번\s*문제|(?=\s*(?:\n|$)))/i,
  );
  return m ? Number(m[1]) : null;
}
export function slideRole(slide) {
  const text = normalize(slide.text),
    head = text.slice(0, 260);
  if (
    /^(?:정\s*답\s*[·/및]*\s*해설|해설|풀이|설명|Explanation|Rationale)\b/i.test(
      head,
    ) ||
    /^(?:해설|풀이|정답\s*해설)/.test(head)
  )
    return "explanation";
  if (
    detectAnswer(slide.text, { standalone: true }).answer ||
    /^(?:정\s*답|답\s*[:：]|Answer\b)/i.test(head)
  )
    return "answer";
  if (
    questionNumber(slide.text) !== null ||
    /^(?:문제|문항|Question\b)/i.test(head)
  )
    return "question";
  return "unknown";
}
export function fileMetadata(filename) {
  const name = normalize(filename)
    .replace(/\.pptx$/i, "")
    .replace(/[_-]+/g, " ");
  const year = Number(
    name.match(/(?:19|20)\d{2}/)?.[0] || new Date().getFullYear(),
  );
  let examType = name.includes("전문의")
    ? "전문의시험"
    : name.includes("전공의")
      ? "전공의평가시험"
      : "시험 종류 확인";
  for (const re of [/[12]\s*차/, /[1-9]\s*교시/]) {
    const m = name.match(re);
    if (m) examType += " " + m[0].replace(/\s/g, "");
  }
  return { year, examType, startNumber: 1 };
}
export function parseSlides(value, total) {
  if (Array.isArray(value)) {
    if (value.some((n) => !Number.isInteger(n) || n < 1 || n > total))
      throw new Error(`슬라이드는 1~${total} 사이 정수로 지정하세요.`);
    return [...new Set(value)].sort((a, b) => a - b);
  }
  const pages = [];
  for (const part of String(value || "")
    .split(/[,，\s]+/)
    .filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-~](\d+))?$/);
    if (!m) throw new Error("슬라이드는 2,3,5-7 형식으로 입력하세요.");
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > total || b - a > MAX_SLIDES)
      throw new Error(`슬라이드는 1~${total} 범위로 지정하세요.`);
    for (let p = a; p <= b; p++) pages.push(p);
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}
function answersFromSlides(slides) {
  const results = slides.flatMap((s) => [
      detectAnswer(s.text, { standalone: true }),
      detectAnswer(s.notes),
    ]),
    values = [...new Set(results.map((a) => a.answer).filter(Boolean))],
    conflicting = results.some((a) => a.conflicting) || values.length > 1;
  return {
    answer: !conflicting && values.length === 1 ? values[0] : null,
    evidence: [...new Set(results.flatMap((a) => a.evidence))],
    conflicting,
  };
}
function candidate(
  slides,
  start,
  end,
  index,
  meta,
  forcedQuestionPages = null,
) {
  const chunk = slides.filter((s) => s.number >= start && s.number <= end);
  let split =
    forcedQuestionPages === null
      ? chunk.findIndex(
          (s, i) => i > 0 && ["answer", "explanation"].includes(slideRole(s)),
        )
      : Math.min(forcedQuestionPages, chunk.length);
  const warnings = [];
  if (split < 0) {
    split = chunk.length > 1 ? 1 : chunk.length;
    warnings.push("정답·해설 시작 위치를 확인하세요.");
  }
  const questionSlides = chunk.slice(0, split).map((s) => s.number),
    explanationSlides = chunk.slice(split).map((s) => s.number);
  const questionText = chunk
      .slice(0, split)
      .map((s) => s.text)
      .join("\n"),
    explanationText = chunk
      .slice(split)
      .map((s) => `${s.text}\n${s.notes || ""}`)
      .join("\n");
  const answer = answersFromSlides(chunk.slice(split)),
    classification = classifyContent(questionText + "\n" + explanationText);
  if (!answer.answer)
    warnings.push(
      answer.conflicting
        ? "서로 다른 정답 표시가 있습니다. 정답을 직접 확인하세요."
        : "정답 번호를 찾지 못했습니다. 직접 지정하세요.",
    );
  if (!explanationSlides.length)
    warnings.push("정답·해설 슬라이드가 없습니다.");
  if (chunk.some((s) => s.ocrError))
    warnings.push(
      "일부 슬라이드의 OCR이 실패했습니다. 원본 화면을 확인하세요.",
    );
  if (
    classification.confidence === "unclassified" ||
    classification.confidence === "low"
  )
    warnings.push("추천 단원을 확인하세요.");
  if (detectAnswer(questionText).answer)
    warnings.push("문제 슬라이드에 정답 표시가 있습니다. 범위를 수정하세요.");
  const originalNumber =
    questionNumber(questionText) || Number(meta.startNumber || 1) + index;
  return {
    key: `pages-${start}-${end}`,
    title: `${meta.year}년 ${meta.examType} ${originalNumber}번`,
    year: meta.year,
    examType: meta.examType,
    originalNumber,
    major: classification.major,
    minor: classification.minor,
    questionSlides,
    explanationSlides,
    correctAnswer: answer.answer,
    answerEvidence: answer.evidence,
    classification,
    conceptNames: classification.concepts,
    warnings,
    selected: false,
  };
}
export function groupSlides(slides, options = {}, metadata = {}) {
  if (!slides.length) throw new Error("분석할 슬라이드가 없습니다.");
  const total = slides.length,
    meta = {
      year: new Date().getFullYear(),
      examType: "시험 종류 확인",
      startNumber: 1,
      ...metadata,
    };
  let starts = [],
    mode = options.mode || "auto";
  if (mode === "manual") {
    starts = parseSlides(options.starts, total);
    if (!starts.length)
      throw new Error("각 문항의 시작 슬라이드를 하나 이상 지정하세요.");
  } else if (mode === "fixed") {
    const first = Number(options.startSlide || 1),
      q = Number(options.questionPages || 1),
      a = Number(options.answerPages ?? 1),
      e = Number(options.explanationPages ?? 1);
    if (
      ![first, q, a, e].every(Number.isInteger) ||
      first < 1 ||
      first > total ||
      q < 1 ||
      a < 0 ||
      e < 0 ||
      q + a + e < 2 ||
      q + a + e > 30
    )
      throw new Error("묶음의 시작 슬라이드와 장수를 확인하세요.");
    for (let n = first; n <= total; n += q + a + e) starts.push(n);
  } else if (mode === "auto") {
    let previous = null;
    for (const slide of slides)
      if (slideRole(slide) === "question") {
        const number = questionNumber(slide.text);
        if (number !== null && number === previous) continue;
        starts.push(slide.number);
        previous = number;
      }
  } else throw new Error("슬라이드 묶음 방식을 확인하세요.");
  const warnings = [];
  if (!starts.length) {
    starts = [1];
    warnings.push(
      "문항 시작을 자동으로 찾지 못했습니다. 미리보기를 보고 시작 슬라이드를 직접 지정하세요.",
    );
  }
  if (starts[0] > 1)
    warnings.push(
      `처음 ${starts[0] - 1}장은 표지 등으로 제외했습니다. 범위를 확인하세요.`,
    );
  const candidates = starts.map((start, i) =>
    candidate(
      slides,
      start,
      (starts[i + 1] || total + 1) - 1,
      i,
      meta,
      mode === "fixed" ? Number(options.questionPages || 1) : null,
    ),
  );
  return {
    candidates,
    warnings,
    options: { ...options, mode },
    metadata: meta,
  };
}
export function importedId(fileHash, questionSlides) {
  const hash = createHash("sha256")
    .update(fileHash + ":" + questionSlides.join(","))
    .digest("hex")
    .slice(0, 32);
  return `q_${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}
