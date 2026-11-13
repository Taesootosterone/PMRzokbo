"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Upload,
  RefreshCw,
  Check,
  FileStack,
  AlertCircle,
  X,
} from "lucide-react";
import { api, digits } from "./types";
import "./ppt-import.css";

type Slide = {
  number: number;
  text: string;
  notes: string;
  ocrText?: string;
  ocrError?: string;
  hidden?: boolean;
};
type Candidate = {
  key: string;
  title: string;
  year: number;
  examType: string;
  originalNumber: number;
  major: string;
  minor: string;
  questionSlides: number[];
  explanationSlides: number[];
  correctAnswer: number | null;
  conceptNames: string[];
  warnings: string[];
  answerEvidence: string[];
  classification: {
    confidence: string;
    evidence: string[];
    alternatives?: string[];
  };
  selected: boolean;
};
type Draft = Candidate & {
  qInput: string;
  eInput: string;
  conceptInput: string;
};
type Job = {
  id: string;
  filename: string;
  bytes: number;
  phase: string;
  progress: number;
  totalSlides?: number;
  completedSlides?: number;
  ocrCount?: number;
  error?: string | null;
  warnings: string[];
  slides: Slide[];
  candidates: Candidate[];
  reviewDrafts?: Draft[] | null;
  metadata: { year: number; examType: string; startNumber: number };
  commitResult?: {
    added: number;
    skipped: number;
    questionIds: string[];
  } | null;
};
type Listing = {
  capabilities: { available: boolean; maxBytes: number; downloadUrl: string };
  jobs: (Omit<Job, "slides" | "candidates"> & { candidateCount: number })[];
};
const active = ["queued", "analyzing", "rendering", "ocr", "committing"];
const phaseName: Record<string, string> = {
  uploaded: "원본 저장됨",
  queued: "분석 준비 중",
  analyzing: "슬라이드 구조 읽는 중",
  rendering: "슬라이드 화면 변환 중",
  ocr: "이미지 속 글자 읽는 중",
  ready: "검토 대기",
  committing: "문항 등록 중",
  committed: "등록 완료",
  error: "확인 필요",
  cancelled: "분석 중지됨",
};
function pages(value: string, total: number) {
  const numbers: number[] = [];
  for (const part of value.split(/[,，\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-~](\d+))?$/);
    if (!m) return [];
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > total || b - a > 1200) return [];
    for (let n = a; n <= b; n++) numbers.push(n);
  }
  return [...new Set(numbers)].sort((a, b) => a - b);
}
function valid(c: Draft, total: number) {
  const q = pages(c.qInput, total),
    e = pages(c.eInput, total);
  return (
    !!c.title.trim() &&
    !!c.major.trim() &&
    !!c.minor.trim() &&
    !!c.examType.trim() &&
    c.year >= 1900 &&
    c.year <= 2200 &&
    c.originalNumber >= 1 &&
    !!c.correctAnswer &&
    q.length > 0 &&
    e.length > 0 &&
    !q.some((n) => e.includes(n))
  );
}

export function PptImportPage({
  refresh,
  notify,
}: {
  refresh: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null),
    [job, setJob] = useState<Job | null>(null),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [ocr, setOcr] = useState(true),
    [reviewed, setReviewed] = useState(false),
    [isDemo, setIsDemo] = useState(false),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState<number | null>(null);
  const [mode, setMode] = useState("auto"),
    [starts, setStarts] = useState(""),
    [startSlide, setStartSlide] = useState(1),
    [qCount, setQCount] = useState(1),
    [aCount, setACount] = useState(1),
    [eCount, setECount] = useState(1),
    [year, setYear] = useState(new Date().getFullYear()),
    [examType, setExamType] = useState(""),
    [startNumber, setStartNumber] = useState(1);
  const updateListing = () => api<Listing>("ppt-imports").then(setListing);
  function accept(value: Job) {
    setJob(value);
    setError("");
    setReviewed(false);
    setDirty(false);
    setDrafts(
      value.reviewDrafts ||
        (value.candidates || []).map((c) => ({
          ...c,
          qInput: c.questionSlides.join(", "),
          eInput: c.explanationSlides.join(", "),
          conceptInput: c.conceptNames.join(", "),
        })),
    );
    setYear(value.metadata.year);
    setExamType(value.metadata.examType);
    setStartNumber(value.metadata.startNumber || 1);
    setStarts(
      (value.candidates || [])
        .map((c) => c.questionSlides[0])
        .filter(Boolean)
        .join(", "),
    );
  }
  useEffect(() => {
    void updateListing().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!job || !active.includes(job.phase)) return;
    let mounted = true;
    const id = job.id;
    const timer = setInterval(() => {
      void api<Job>(`ppt-imports/${id}`)
        .then((value) => {
          if (!mounted) return;
          if (!active.includes(value.phase)) {
            accept(value);
            void updateListing();
          } else setJob(value);
        })
        .catch((e) => {
          if (mounted) setError(e.message);
        });
    }, 1800);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.phase]);
  useEffect(() => {
    if (preview === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [preview]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const processing = !!job && active.includes(job.phase),
    selected = drafts.filter((c) => c.selected),
    total = job?.slides?.length || 0;
  const patch = (key: string, value: Partial<Draft>) => {
    setDirty(true);
    setReviewed(false);
    setDrafts((rows) =>
      rows.map((c) => (c.key === key ? { ...c, ...value } : c)),
    );
  };
  async function upload(file: File) {
    setError("");
    if (file.size > 256 * 1024 * 1024) {
      setError("PPTX는 256MB 이하로 나누어 주세요.");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/v1/ppt-imports", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "X-Pmrz-Filename": encodeURIComponent(file.name),
          "X-Pmrz-Ocr": ocr ? "1" : "0",
        },
        body: file,
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || "PPTX 업로드에 실패했습니다.");
      accept(value);
      await updateListing();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function action(name: "retry" | "cancel") {
    if (!job) return;
    setBusy(true);
    try {
      accept(
        await api<Job>(`ppt-imports/${job.id}/${name}`, {
          method: "POST",
          body: "{}",
        }),
      );
      await updateListing();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function regroup() {
    if (!job) return;
    if (
      dirty &&
      !window.confirm(
        "묶음을 다시 나누면 현재 초안의 수정 내용이 초기화됩니다. 계속할까요?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      accept(
        await api<Job>(`ppt-imports/${job.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            options: {
              mode,
              starts,
              startSlide,
              questionPages: qCount,
              answerPages: aCount,
              explanationPages: eCount,
            },
            metadata: { year, examType, startNumber },
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      setJob(
        await api<Job>(`ppt-imports/${job.id}/draft`, {
          method: "POST",
          body: JSON.stringify({ candidates: drafts }),
        }),
      );
      setDirty(false);
      notify(
        "검토 초안을 서버에 저장했습니다. 다음에도 이어서 검토할 수 있습니다.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        added: number;
        skipped: number;
        questionIds: string[];
      }>(`ppt-imports/${job.id}/commit`, {
        method: "POST",
        body: JSON.stringify({
          reviewed,
          isDemo,
          candidates: selected.map((c) => ({
            ...c,
            questionSlides: c.qInput,
            explanationSlides: c.eInput,
            conceptNames: c.conceptInput
              .split(/[,，]/)
              .map((s) => s.trim())
              .filter(Boolean),
          })),
        }),
      });
      accept(await api<Job>(`ppt-imports/${job.id}`));
      await refresh();
      await updateListing();
      notify(
        `${result.added}문항 등록 · 기존 동일 문항 ${result.skipped}개 유지`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !job ||
      !window.confirm(
        "이 PPT의 원본 사본·미리보기·분석 초안을 삭제합니다. 이미 등록한 문항·이미지·풀이 기록은 유지됩니다. 삭제할까요?",
      )
    )
      return;
    setBusy(true);
    try {
      await api(`ppt-imports/${job.id}`, { method: "DELETE" });
      setJob(null);
      setDrafts([]);
      await updateListing();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const thumb = (n: number) =>
    job ? `/api/v1/ppt-imports/${job.id}/slides/${n}?thumb=1` : "";
  return (
    <>
      <Link className="back-link" href="/manage">
        ← 문항 관리
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">문제·정답·해설을 한 흐름으로</div>
          <h1>
            PPTX 자동 가져오기<span className="heading-dot">.</span>
          </h1>
          <p>장수가 달라도 경계를 찾고, 확인한 문항만 문제은행에 넣습니다.</p>
        </div>
      </div>
      <div className="ppt-intro-grid">
        <section className="panel ppt-upload">
          <FileStack size={30} />
          <h2>PowerPoint 파일 선택</h2>
          <p>
            슬라이드 화면을 이미지로 보존하고 텍스트·정답·단원을 추출합니다.
            파일은 서버 Mac에서 처리합니다.
          </p>
          {listing && !listing.capabilities.available && (
            <div className="ppt-warning">
              <strong>LibreOffice 설치가 한 번 필요합니다.</strong>
              <p>
                무료 LibreOffice를 맥미니의 Applications에 설치한 뒤 이 화면을
                새로고침하세요. PowerPoint 모양을 이미지로 만드는 데 사용합니다.
              </p>
              <a
                className="text-button"
                href={listing.capabilities.downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                LibreOffice 공식 다운로드 ↗
              </a>
            </div>
          )}
          <label
            className={`button primary file-button ${uploading || processing || !listing?.capabilities.available ? "disabled" : ""}`}
          >
            <Upload size={16} />
            {uploading ? "PPTX 전송 중…" : "PPTX 파일 올리기"}
            <input
              aria-label="PPTX 파일 업로드"
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              disabled={
                uploading || processing || !listing?.capabilities.available
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={ocr}
              disabled={uploading || processing}
              onChange={(e) => setOcr(e.target.checked)}
            />
            이미지 속 글자도 OCR로 읽기
          </label>
          <p className="field-help">
            최대 256MB · 1,200장 · .pptx만 지원합니다. OCR을 사용하면 시간이 더
            걸릴 수 있습니다. 파일을 나누어 여러 번 가져올 수 있습니다.
          </p>
        </section>
        <section className="panel ppt-history">
          <h2>이전에 올린 PPT</h2>
          <p className="field-help">
            원본과 분석 초안은 데이터 폴더에 남습니다. 수정한 값은 ‘검토 초안
            저장’을 누르면 다음에도 이어서 검토할 수 있습니다.
          </p>
          {!listing?.jobs.length && <p>아직 올린 PPT가 없습니다.</p>}
          {listing?.jobs.map((item) => (
            <button
              key={item.id}
              className={`ppt-job-button ${item.id === job?.id ? "selected" : ""}`}
              disabled={busy || uploading}
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm(
                    "다른 PPT로 이동하면 저장하지 않은 초안 수정이 사라집니다. 이동할까요?",
                  )
                )
                  return;
                void api<Job>(`ppt-imports/${item.id}`)
                  .then(accept)
                  .catch((e) => setError(e.message));
              }}
            >
              <strong>{item.filename}</strong>
              <span>
                {phaseName[item.phase] || item.phase} · {item.candidateCount}
                문항 · {(item.bytes / 1024 / 1024).toFixed(1)}MB
              </span>
            </button>
          ))}
        </section>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {job && (
        <section className="panel ppt-current">
          <div className="section-heading">
            <div>
              <h2>{job.filename}</h2>
              <p role="status">
                {phaseName[job.phase] || job.phase}
                {job.totalSlides
                  ? ` · ${job.completedSlides || 0}/${job.totalSlides}장`
                  : ""}
              </p>
            </div>
            {processing && job.phase !== "committing" && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void action("cancel")}
              >
                분석 중지
              </button>
            )}
            {!processing && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void remove()}
              >
                분석 파일 삭제
              </button>
            )}
          </div>
          {processing && (
            <>
              <div className="ppt-progress">
                <span style={{ width: `${Math.max(2, job.progress || 0)}%` }} />
              </div>
              <p className="field-help">
                분석은 브라우저를 닫아도 서버가 켜져 있으면 계속됩니다. 서버를
                중지하거나 업데이트하기 전에는 분석이 끝날 때까지 기다려 주세요.
              </p>
            </>
          )}
          {job.error && (
            <p className="form-error" role="alert">
              {job.error}
            </p>
          )}
          {["error", "cancelled", "uploaded"].includes(job.phase) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void action("retry")}
            >
              <RefreshCw size={16} />
              보존한 원본 다시 분석
            </button>
          )}
          {job.commitResult && (
            <div className="backup-success" role="status">
              <Check size={18} />
              <div>
                <strong>
                  {job.commitResult.added}문항 등록 · 기존 동일 문항{" "}
                  {job.commitResult.skipped}개 유지
                </strong>
                <p>
                  <Link href="/manage">문항 관리에서 확인하기 →</Link>
                </p>
              </div>
            </div>
          )}
          {["ready", "committed"].includes(job.phase) && (
            <>
              <div className="ppt-warning">
                <strong>자동 분석은 초안입니다.</strong>
                <p>
                  단원은 의학 용어 규칙으로 추천합니다. 묶음·정답·분류를 확인한
                  뒤 선택해 등록하세요. 정답 표시가 없거나 서로 다르면 정답을
                  추측해 넣지 않습니다.
                </p>
                {job.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
              <details className="ppt-grouping" open={!drafts.length}>
                <summary>문항 묶음·시험 정보 조정</summary>
                <p>
                  문항마다 장수가 다르면 ‘자동’ 또는 ‘시작 슬라이드 직접 지정’을
                  사용하세요. 묶음 조정은 아래 문항을 수정하기 전에 하는 것이
                  좋습니다.
                </p>
                <div className="form-grid">
                  <label>
                    묶음 방식
                    <select
                      aria-label="PPT 묶음 방식"
                      value={mode}
                      onChange={(e) => setMode(e.target.value)}
                    >
                      <option value="auto">
                        자동: 문항 번호·정답·해설 표시
                      </option>
                      <option value="manual">
                        문항 시작 슬라이드 직접 지정
                      </option>
                      <option value="fixed">
                        장수가 일정한 파일만: 반복 패턴
                      </option>
                    </select>
                  </label>
                  {mode === "manual" && (
                    <label>
                      각 문항 시작 슬라이드
                      <input
                        aria-label="문항 시작 슬라이드"
                        placeholder="예: 2, 6, 9, 14"
                        value={starts}
                        onChange={(e) => setStarts(e.target.value)}
                      />
                    </label>
                  )}
                  {mode === "fixed" && (
                    <>
                      <label>
                        첫 문제 슬라이드
                        <input
                          type="number"
                          min={1}
                          max={total}
                          value={startSlide}
                          onChange={(e) =>
                            setStartSlide(Number(e.target.value))
                          }
                        />
                      </label>
                      <label>
                        문제 장수
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={qCount}
                          onChange={(e) => setQCount(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        정답 장수
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={aCount}
                          onChange={(e) => setACount(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        해설 장수
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={eCount}
                          onChange={(e) => setECount(Number(e.target.value))}
                        />
                      </label>
                    </>
                  )}
                  <label>
                    전체 연도
                    <input
                      aria-label="PPT 전체 연도"
                      type="number"
                      min={1900}
                      max={2200}
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    전체 시험 종류
                    <input
                      aria-label="PPT 전체 시험 종류"
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                    />
                  </label>
                  <label>
                    번호를 읽지 못한 경우 시작 번호
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={startNumber}
                      onChange={(e) => setStartNumber(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void regroup()}
                  >
                    이 설정으로 묶음 다시 만들기
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setDrafts((rows) =>
                        rows.map((c) => ({ ...c, year, examType })),
                      );
                      setDirty(true);
                      setReviewed(false);
                    }}
                  >
                    연도·시험 종류만 전체에 적용
                  </button>
                </div>
              </details>
              <details className="ppt-slides">
                <summary>전체 슬라이드 보기 · {total}장</summary>
                <p className="field-help">
                  이미지를 누르면 확대됩니다. ‘문항 시작으로 표시’한 뒤 위의
                  묶음 설정을 적용하세요.
                </p>
                <div className="ppt-slide-grid">
                  {job.slides.map((slide) => (
                    <div key={slide.number}>
                      <button
                        className="ppt-slide-image"
                        onClick={() => setPreview(slide.number)}
                      >
                        <img
                          src={thumb(slide.number)}
                          alt={`슬라이드 ${slide.number}`}
                          loading="lazy"
                        />
                        <span>
                          {slide.number}번{slide.hidden ? " · 숨김" : ""}
                          {slide.ocrText ? " · OCR" : ""}
                        </span>
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setMode("manual");
                          const set = new Set(pages(starts, total));
                          if (set.has(slide.number)) set.delete(slide.number);
                          else set.add(slide.number);
                          setStarts([...set].sort((a, b) => a - b).join(", "));
                        }}
                      >
                        {pages(starts, total).includes(slide.number)
                          ? "✓ 문항 시작 표시됨"
                          : "문항 시작으로 표시"}
                      </button>
                    </div>
                  ))}
                </div>
              </details>
              <div className="section-heading">
                <h2>등록 전 검토 · {drafts.length}문항</h2>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => {
                    setDrafts((rows) =>
                      rows.map((c) => ({ ...c, selected: valid(c, total) })),
                    );
                    setReviewed(false);
                  }}
                >
                  등록 가능한 문항 전체 선택
                </button>
              </div>
              <div className="ppt-candidates">
                {drafts.map((c, index) => (
                  <article
                    className="ppt-candidate"
                    key={c.key}
                    data-key={c.key}
                  >
                    <div className="ppt-candidate-heading">
                      <label className="check-label">
                        <input
                          aria-label={`문항 ${c.originalNumber} 선택`}
                          type="checkbox"
                          checked={c.selected}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { selected: e.target.checked })
                          }
                        />
                        <strong>
                          {index + 1}. {c.title}
                        </strong>
                      </label>
                      <span
                        className={`badge ${valid(c, total) ? "mint" : "rose"}`}
                      >
                        {valid(c, total) ? "등록 가능" : "확인 필요"}
                      </span>
                    </div>
                    <div className="ppt-review-grid">
                      <div>
                        <label>
                          문제 슬라이드
                          <input
                            aria-label="문제 슬라이드"
                            value={c.qInput}
                            disabled={busy}
                            onChange={(e) =>
                              patch(c.key, { qInput: e.target.value })
                            }
                            placeholder="예: 2,3 또는 2-3"
                          />
                        </label>
                        <div className="ppt-thumbnails">
                          {pages(c.qInput, total).map((n) => (
                            <button key={n} onClick={() => setPreview(n)}>
                              <img
                                src={thumb(n)}
                                alt={`문제 슬라이드 ${n}`}
                                loading="lazy"
                              />
                              <span>{n}번</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label>
                          정답·해설 슬라이드
                          <input
                            aria-label="정답·해설 슬라이드"
                            value={c.eInput}
                            disabled={busy}
                            onChange={(e) =>
                              patch(c.key, { eInput: e.target.value })
                            }
                            placeholder="예: 4-6"
                          />
                        </label>
                        <div className="ppt-thumbnails">
                          {pages(c.eInput, total).map((n) => (
                            <button key={n} onClick={() => setPreview(n)}>
                              <img
                                src={thumb(n)}
                                alt={`해설 슬라이드 ${n}`}
                                loading="lazy"
                              />
                              <span>{n}번</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label>
                        문항 제목
                        <input
                          value={c.title}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { title: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        정답 번호
                        <select
                          aria-label="PPT 정답 번호"
                          value={c.correctAnswer || ""}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, {
                              correctAnswer: Number(e.target.value) || null,
                            })
                          }
                        >
                          <option value="">확인 후 지정</option>
                          {digits.map((d, i) => (
                            <option key={d} value={i + 1}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        대단원
                        <input
                          value={c.major}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { major: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        소단원
                        <input
                          value={c.minor}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { minor: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        연도
                        <input
                          type="number"
                          min={1900}
                          max={2200}
                          value={c.year}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { year: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        시험 종류
                        <input
                          value={c.examType}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { examType: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        원래 문제번호
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={c.originalNumber}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, {
                              originalNumber: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        관련 개념 · 쉼표로 구분
                        <input
                          value={c.conceptInput}
                          disabled={busy}
                          onChange={(e) =>
                            patch(c.key, { conceptInput: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <p className="field-help">
                      단원 추천 근거:{" "}
                      {c.classification.evidence.join(", ") ||
                        "용어를 찾지 못함"}
                      {c.classification.alternatives?.length
                        ? ` · 다른 후보: ${c.classification.alternatives.join(", ")}`
                        : ""}
                    </p>
                    <details>
                      <summary>추출한 글자·정답 근거·확인 사항</summary>
                      <p>
                        정답 표시:{" "}
                        {c.answerEvidence.join(" / ") ||
                          "없음 — 직접 확인하세요."}
                      </p>
                      {c.warnings.map((w, i) => (
                        <p className="field-help" key={i}>
                          <AlertCircle size={13} />
                          {w}
                        </p>
                      ))}
                      <pre className="ppt-extracted">
                        {job.slides
                          .filter((s) =>
                            [
                              ...pages(c.qInput, total),
                              ...pages(c.eInput, total),
                            ].includes(s.number),
                          )
                          .map(
                            (s) =>
                              `[${s.number}번]\n${s.text}${s.notes ? "\n[발표자노트]\n" + s.notes : ""}`,
                          )
                          .join("\n\n")}
                      </pre>
                    </details>
                  </article>
                ))}
              </div>
              <section className="ppt-commit panel">
                <h2>확인한 문항 등록</h2>
                <p className="field-help">
                  {dirty
                    ? "아직 서버에 저장하지 않은 수정 내용이 있습니다."
                    : "분석·저장한 검토 초안을 보고 있습니다."}
                </p>
                <button
                  className="button secondary"
                  disabled={busy || !dirty}
                  onClick={() => void saveDraft()}
                >
                  검토 초안 저장
                </button>
                <p>
                  {selected.length}문항 선택 · 문제·해설 이미지와 개념 연결을
                  함께 등록합니다.
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={busy}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  선택한 문항의 슬라이드 묶음·정답·분류를 확인했습니다.
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={isDemo}
                    disabled={busy}
                    onChange={(e) => setIsDemo(e.target.checked)}
                  />
                  직접 만든 예시 파일이므로 데모 문항으로 표시
                </label>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !reviewed ||
                    !selected.length ||
                    selected.some((c) => !valid(c, total))
                  }
                  onClick={() => void commit()}
                >
                  {busy ? (
                    <RefreshCw size={16} className="spin" />
                  ) : (
                    <Check size={16} />
                  )}{" "}
                  {busy ? "처리 중…" : `선택한 ${selected.length}문항 등록`}
                </button>
                <p className="field-help">
                  같은 원본 파일의 같은 문제 슬라이드는 중복 등록하지 않고 기존
                  문항을 유지합니다. 원본 파일을 수정해 다시 저장하면 다른
                  파일로 인식될 수 있습니다.
                </p>
              </section>
            </>
          )}
        </section>
      )}
      <p className="settings-backup-help">
        등록한 문항·문제/해설 이미지·개념 연결은 전체 백업에 포함됩니다.
        업로드한 원본 PPT와 미등록 분석 초안은 별도 분석 자료이므로 원본 파일도
        따로 보관하세요. 개념 본문과 NOAH 데이터는 수정하지 않습니다.
      </p>
      {preview !== null && job && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="PPT 슬라이드 확대"
          onClick={() => setPreview(null)}
        >
          <button
            className="lightbox-close"
            aria-label="슬라이드 확대 닫기"
            onClick={() => setPreview(null)}
          >
            <X />
          </button>
          <img
            alt={`슬라이드 ${preview} 원본`}
            src={`/api/v1/ppt-imports/${job.id}/slides/${preview}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
