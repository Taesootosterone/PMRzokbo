"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Star,
  Link2,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  ZoomIn,
  ArrowRight,
  HardDrive,
  NotebookPen,
  Flag,
  RefreshCw,
} from "lucide-react";
import {
  api,
  digits,
  type Question,
  type Concept,
  type Session,
  type History,
} from "./types";
export function QuestionPage({
  id,
  concepts,
  start,
  refresh,
  notify,
  onEdit,
}: {
  id: string;
  concepts: Concept[];
  start: (i: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
  onEdit: (q: Question) => void;
}) {
  const [q, setQ] = useState<Question | null>(null),
    [history, setHistory] = useState<History[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<Question>(`questions/${id}`),
      api<History[]>(`questions/${id}/history`),
    ])
      .then(([q, h]) => {
        setQ(q);
        setHistory(h);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (error)
    return (
      <p role="alert" className="form-error">
        {error}
      </p>
    );
  if (!q) return <p>문항을 불러오는 중…</p>;
  return (
    <>
      <Link className="back-link" href="/">
        ← 단원별 학습
      </Link>
      <div className="page-heading question-heading">
        <div>
          <div className="eyebrow">나의 문항 서재</div>
          <h1>{q.title}</h1>
          {q.source && (
            <p className="field-help">
              PPT 원본: {q.source.filename} · 문제 슬라이드{" "}
              {q.source.questionSlides.join(", ")} · 정답·해설{" "}
              {q.source.explanationSlides.join(", ")}
            </p>
          )}
          <p>
            {q.major} → {q.minor} · {q.year}년 {q.examType} {q.originalNumber}번{" "}
            {q.isDemo && <span className="badge demo">데모 문항</span>}
          </p>
        </div>
        <button className="button secondary small" onClick={() => onEdit(q)}>
          문항 수정
        </button>
      </div>
      <div className="solver-layout">
        <section className="panel question-panel">
          <div className="question-toolbar">
            <span className="tiny-label">문항 미리보기</span>
            <QuestionActions
              q={q}
              setQ={setQ}
              refresh={refresh}
              notify={notify}
            />
          </div>
          <QuestionBody q={q} />
          <button
            className="button primary"
            onClick={() => void start({ mode: "study", questionIds: [q.id] })}
          >
            이 문제 풀기 <ArrowRight size={16} />
          </button>
          <p className="field-help">
            정답과 해설은 풀이를 제출하면 표시됩니다.
          </p>
        </section>
        <aside className="solver-aside">
          <Memo q={q} refresh={refresh} notify={notify} />
          <ConceptLinks ids={q.conceptIds} concepts={concepts} />
        </aside>
      </div>
      <section className="panel history-panel">
        <h2>
          모든 풀이 기록{" "}
          <span className="subtle-count">{history.length}회</span>
        </h2>
        <p className="field-help">
          각 시도의 제출 당시 문항과 정답을 보존합니다.
        </p>
        {history.map((h, i) => (
          <details key={h.id} className="attempt-row">
            <summary>
              <span className={`badge ${h.correct ? "mint" : "rose"}`}>
                {h.correct ? "정답" : "오답"}
              </span>
              <span>{new Date(h.createdAt).toLocaleString("ko-KR")}</span>
              <span>
                선택 {h.selected ? digits[h.selected - 1] : "미응답"} · 당시
                정답 {digits[(h.snapshot.correctAnswer || 1) - 1]}
              </span>
              <ChevronRight size={15} />
            </summary>
            <div className="attempt-snapshot">
              <strong>{h.snapshot.title}</strong>
              <QuestionBody q={h.snapshot} />
              <Explanation
                q={h.snapshot}
                selected={h.selected || 0}
                concepts={concepts}
              />
              <Link href={`/sessions/${h.sessionId}`} className="text-button">
                당시 풀이 열기 →
              </Link>
            </div>
          </details>
        ))}
        {!history.length && (
          <p className="list-caption">아직 제출한 풀이 기록이 없습니다.</p>
        )}
      </section>
    </>
  );
}
export function SessionPage({
  id,
  concepts,
  refresh,
  notify,
}: {
  id: string;
  concepts: Concept[];
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    api<Session>(`sessions/${id}`)
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [id]);
  async function update(input: Record<string, unknown>) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Session>(`sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...input, revision: session.revision }),
      });
      setSession(next);
      if (["reveal", "finish"].includes(String(input.action))) await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <p role={error ? "alert" : undefined}>
        {error || "저장된 풀이를 불러오는 중…"}
      </p>
    );
  const q = session.questions[session.index],
    selected = session.answers[q.id],
    revealed =
      session.status === "completed" || session.revealed.includes(q.id),
    completed = session.status === "completed";
  const correct = session.questions.filter(
    (q) => session.answers[q.id] === q.correctAnswer,
  ).length;
  return (
    <>
      <div className="solver-top">
        <Link className="back-link" href="/">
          ← 나의 서재
        </Link>
        <span className="save-indicator" role="status">
          <HardDrive size={13} />
          {busy
            ? "저장 중…"
            : error
              ? "저장 실패 — 다시 시도하세요"
              : "서버에 저장 완료"}
        </span>
      </div>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {session.mode === "exam" ? "나만의 시험" : "집중 학습"}
          </div>
          <h1>
            {session.mode === "exam"
              ? "나만의 맞춤 시험"
              : "한 문제씩, 깊이 있게"}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {q.major} <span>›</span> {q.minor} · {session.questions.length}문항
          </p>
        </div>
        <span className={`badge ${completed ? "mint" : "neutral"}`}>
          {completed
            ? "제출 완료"
            : session.mode === "exam"
              ? "시험 모드 · 최종 제출 전 정답 비공개"
              : "학습 모드 · 제출 후 바로 해설"}
        </span>
      </div>
      {error && (
        <div role="alert" className="error-banner">
          {error}
          <button
            className="text-button"
            onClick={() => window.location.reload()}
          >
            저장된 상태 새로고침
          </button>
        </div>
      )}
      {completed && (
        <div className="result-banner">
          <span className="result-check">
            <Check size={23} />
          </span>
          <div>
            <strong>학습을 마쳤습니다.</strong>
            <p>각 문항의 해설과 관련 개념을 확인해보세요.</p>
          </div>
          <div className="result-score">
            {correct}
            <small> / {session.questions.length} 정답</small>
          </div>
        </div>
      )}
      <div className="solver-layout">
        <section className="panel question-panel">
          <div className="question-toolbar">
            <span className="question-position">
              문항 <strong>{String(session.index + 1).padStart(2, "0")}</strong>
              <span>/ {String(session.questions.length).padStart(2, "0")}</span>
            </span>
            <QuestionActions
              q={q}
              setQ={(next) =>
                setSession((s) =>
                  s
                    ? {
                        ...s,
                        questions: s.questions.map((item) =>
                          item.id === q.id
                            ? { ...item, starred: next.starred }
                            : item,
                        ),
                      }
                    : s,
                )
              }
              refresh={refresh}
              notify={notify}
            />
          </div>
          <div className="question-source">
            {q.year}년 {q.examType} · {q.originalNumber}번
            {q.isDemo && (
              <span className="badge demo">데모 문항 · 실제 기출 아님</span>
            )}
          </div>
          <h2 className="problem-title">{q.title}</h2>
          <QuestionBody q={q} />
          <div className="answer-list" role="group" aria-label="답 선택">
            {digits.map((d, i) => (
              <button
                key={d}
                aria-label={`${i + 1}번 답 선택`}
                aria-pressed={selected === i + 1}
                disabled={busy || revealed}
                className={`answer-option ${selected === i + 1 ? "selected" : ""} ${revealed && q.correctAnswer === i + 1 ? "answer-correct" : ""} ${revealed && selected === i + 1 && q.correctAnswer !== selected ? "answer-wrong" : ""}`}
                onClick={() =>
                  void update({
                    action: "answer",
                    questionId: q.id,
                    answer: i + 1,
                  })
                }
              >
                <span className="option-number">{d}</span>
                <span>{q.choices?.[i] || `${i + 1}번`}</span>
                {revealed && q.correctAnswer === i + 1 ? (
                  <Check size={18} />
                ) : selected === i + 1 ? (
                  <span className="selected-dot" />
                ) : null}
              </button>
            ))}
          </div>
          {!revealed && session.mode === "study" && (
            <div className="submit-row">
              <span>가장 적절한 답을 하나 선택하세요.</span>
              <button
                className="button primary"
                disabled={busy || !selected}
                onClick={() => void update({ action: "reveal" })}
              >
                답 제출하고 해설 보기 <ArrowRight size={16} />
              </button>
            </div>
          )}
          {revealed && (
            <Explanation q={q} selected={selected || 0} concepts={concepts} />
          )}
          <div className="question-navigation">
            <button
              className="button secondary"
              disabled={busy || session.index === 0}
              onClick={() =>
                void update({ action: "navigate", index: session.index - 1 })
              }
            >
              <ChevronLeft size={16} />
              이전 문항
            </button>
            <span>
              {session.index + 1} / {session.questions.length}
            </span>
            <button
              className="button secondary"
              disabled={busy || session.index === session.questions.length - 1}
              onClick={() =>
                void update({ action: "navigate", index: session.index + 1 })
              }
            >
              다음 문항
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        <aside className="solver-aside">
          <section className="panel question-map">
            <h3>
              <Flag size={16} />
              문항 탐색
            </h3>
            <div className="question-map-grid">
              {session.questions.map((item, i) => (
                <button
                  key={item.id}
                  aria-label={`${i + 1}번 문항으로 이동`}
                  disabled={busy}
                  onClick={() => void update({ action: "navigate", index: i })}
                  className={`${i === session.index ? "current" : ""} ${session.answers[item.id] ? "answered" : ""} ${completed ? (session.answers[item.id] === item.correctAnswer ? "correct" : "wrong") : ""}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <p className="field-help">
              {Object.keys(session.answers).length}/{session.questions.length}
              문항 답 선택
            </p>
            {session.mode === "exam" && !completed && (
              <button
                className="button primary full-width"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                시험 최종 제출 <Check size={16} />
              </button>
            )}
            {completed && (
              <Link href="/notebook" className="button secondary full-width">
                마이노트로 복습하기
              </Link>
            )}
          </section>
          <Memo key={q.id} q={q} refresh={refresh} notify={notify} />
        </aside>
      </div>
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-label="시험 최종 제출"
          >
            <h2>시험을 제출할까요?</h2>
            <p>
              {session.questions.length}문항 중{" "}
              {Object.keys(session.answers).length}개에 답했습니다. 미응답은
              오답으로 기록됩니다. 제출 후에는 답을 바꿀 수 없습니다.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                계속 풀기
              </button>
              <button
                className="button primary"
                onClick={() => {
                  setConfirm(false);
                  void update({ action: "finish" });
                }}
              >
                최종 제출하고 채점
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export function QuestionBody({ q }: { q: Question }) {
  return (
    <div className="question-body">
      {q.stem && <p className="stem-text">{q.stem}</p>}
      {q.questionImage && (
        <ImageViewer id={q.questionImage} alt="문제 이미지" />
      )}
    </div>
  );
}
function ImageViewer({ id, alt }: { id: string; alt: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button
        className="question-image"
        onClick={() => setOpen(true)}
        aria-label={`${alt} 확대`}
      >
        <img src={`/api/v1/images/${id}`} alt={alt} />
        <span>
          <ZoomIn size={14} /> 눌러서 크게 보기
        </span>
      </button>
      {open && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} 확대 보기`}
          onClick={() => setOpen(false)}
        >
          <button
            className="lightbox-close"
            aria-label="확대 이미지 닫기"
            onClick={() => setOpen(false)}
          >
            <X size={25} />
          </button>
          <img
            src={`/api/v1/images/${id}`}
            alt={`${alt} 원본`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
function Explanation({
  q,
  selected,
  concepts,
}: {
  q: Question;
  selected: number;
  concepts: Concept[];
}) {
  return (
    <section className="explanation-section">
      <div
        className={`answer-result ${selected === q.correctAnswer ? "is-correct" : "is-wrong"}`}
      >
        <span>
          {selected === q.correctAnswer ? <Check size={18} /> : <X size={18} />}
          <strong>
            {selected === q.correctAnswer
              ? "정답입니다."
              : "다시 확인해보세요."}
          </strong>
        </span>
        <span>
          정답 <strong>{digits[(q.correctAnswer || 1) - 1]}</strong>{" "}
          <small>내 답 {selected ? digits[selected - 1] : "미응답"}</small>
        </span>
      </div>
      <div className="explanation-body">
        <div className="eyebrow">정답의 이유를 이해하기</div>
        <h3>정답 해설</h3>
        {q.explanation && <p>{q.explanation}</p>}
        {q.explanationImage && (
          <ImageViewer id={q.explanationImage} alt="정답·해설 이미지" />
        )}
        <ConceptLinks ids={q.conceptIds || []} concepts={concepts} />
      </div>
    </section>
  );
}
function ConceptLinks({
  ids,
  concepts,
}: {
  ids: string[];
  concepts: Concept[];
}) {
  const connected = concepts.filter((c) => ids.includes(c.id));
  return (
    <section className="concept-links">
      <h3>
        <Link2 size={16} />
        관련 개념
      </h3>
      {connected.length ? (
        connected.map((c) => (
          <div className="concept-link-row" key={c.id}>
            <Link href={`/concepts/${c.id}`}>
              <strong>{c.name}</strong>
              <span>
                같은 개념의 문제 보기 <ChevronRight size={13} />
              </span>
            </Link>
            {c.externalUrl && (
              <a
                href={c.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${c.name} 외부 노트 열기`}
              >
                <ArrowUpRight size={17} />
                <span>노트</span>
              </a>
            )}
          </div>
        ))
      ) : (
        <p className="field-help">
          연결된 개념이 없습니다. 문항 수정에서 추가할 수 있어요.
        </p>
      )}
    </section>
  );
}
function QuestionActions({
  q,
  setQ,
  refresh,
  notify,
}: {
  q: Question;
  setQ: (q: Question) => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="question-actions">
      <button
        className={`icon-button ${q.starred ? "is-starred" : ""}`}
        title="별표"
        aria-label="별표"
        aria-pressed={q.starred}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await api<Question>(`questions/${q.id}/personal`, {
              method: "PATCH",
              body: JSON.stringify({ starred: !q.starred }),
            });
            setQ({ ...q, starred: result.starred });
            await refresh();
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Star size={19} />
      </button>
      <button
        className="icon-button"
        title="고정 링크 복사"
        aria-label="고정 링크 복사"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}/questions/${q.id}`,
            );
            notify("문항 고정 링크를 복사했습니다.");
          } catch {
            notify(`문항 주소: ${window.location.origin}/questions/${q.id}`);
          }
        }}
      >
        <Link2 size={19} />
      </button>
    </div>
  );
}
function Memo({
  q,
  refresh,
  notify,
}: {
  q: Question;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [memo, setMemo] = useState(q.memo || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel memo-panel">
      <h3>
        <NotebookPen size={17} />
        나의 메모
      </h3>
      <textarea
        aria-label="나의 메모"
        rows={5}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="헷갈렸던 점, 꼭 기억할 내용을 남겨보세요."
        maxLength={20000}
      />
      <button
        className="button secondary small full-width"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`questions/${q.id}/personal`, {
              method: "PATCH",
              body: JSON.stringify({ memo }),
            });
            await refresh();
            notify("메모를 저장했습니다.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "저장 중…" : "메모 저장"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
