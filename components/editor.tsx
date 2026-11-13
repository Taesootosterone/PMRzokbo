"use client";
import { useState } from "react";
import { X, Upload, ImagePlus, Check, Link2, Plus } from "lucide-react";
import { api, digits, type Question, type Concept } from "./types";
export function QuestionEditor({
  initial,
  concepts,
  close,
  saved,
}: {
  initial: Question | null;
  concepts: Concept[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    title: initial?.title || "",
    major: initial?.major || "",
    minor: initial?.minor || "",
    examType: initial?.examType || "",
    year: initial?.year || new Date().getFullYear(),
    originalNumber: initial?.originalNumber || 1,
    stem: initial?.stem || "",
    choices: initial?.choices || ["", "", "", "", ""],
    correctAnswer: initial?.correctAnswer || 1,
    explanation: initial?.explanation || "",
    questionImage: initial?.questionImage || null,
    explanationImage: initial?.explanationImage || null,
    isDemo: initial?.isDemo || false,
    conceptIds: initial?.conceptIds || [],
    source: initial?.source,
  });
  const [kind, setKind] = useState(
      initial?.questionImage || !initial ? "image" : "text",
    ),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(""),
    [error, setError] = useState("");
  const field = (name: string, value: unknown) =>
    setDraft((d) => ({ ...d, [name]: value }));
  const upload = async (
    file: File,
    key: "questionImage" | "explanationImage",
  ) => {
    setUploading(key);
    setError("");
    try {
      if (file.size > 12 * 1024 * 1024)
        throw new Error("이미지는 12MB 이하로 등록하세요.");
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ id: string }>("images", {
        method: "POST",
        body: form,
      });
      field(key, result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading("");
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="modal editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "문항 수정" : "새 문항 등록"}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">나만의 문제은행 채우기</span>
            <h2>{initial ? "문항 수정" : "새 문항 등록"}</h2>
            <p>이미지의 선지는 다시 입력하지 않아도 괜찮아요.</p>
          </div>
          <button
            className="icon-button"
            aria-label="닫기"
            disabled={busy || !!uploading}
            onClick={close}
          >
            <X size={22} />
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              if (
                kind === "image" &&
                (!draft.questionImage || !draft.explanationImage)
              )
                throw new Error(
                  "이미지형 문항에는 문제 이미지와 해설 이미지 한 쌍이 필요합니다.",
                );
              await api(initial ? `questions/${initial.id}` : "questions", {
                method: initial ? "PUT" : "POST",
                body: JSON.stringify(draft),
              });
              await saved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="editor-tabs">
            <button
              type="button"
              className={kind === "image" ? "selected" : ""}
              onClick={() => setKind("image")}
            >
              <ImagePlus size={16} />
              이미지 한 쌍 등록
            </button>
            <button
              type="button"
              className={kind === "text" ? "selected" : ""}
              onClick={() => setKind("text")}
            >
              지문·선지 직접 입력
            </button>
          </div>
          <label>
            문항 제목
            <input
              required
              value={draft.title}
              onChange={(e) => field("title", e.target.value)}
              placeholder="예: 척수손상 환자의 방광 기능 평가"
              maxLength={240}
            />
          </label>
          <div className="form-grid">
            <label>
              대단원
              <input
                required
                list="major-options"
                value={draft.major}
                onChange={(e) => field("major", e.target.value)}
                placeholder="예: 척수"
              />
            </label>
            <label>
              소단원
              <input
                required
                value={draft.minor}
                onChange={(e) => field("minor", e.target.value)}
                placeholder="예: 신경인성 방광"
              />
            </label>
            <label>
              시험 종류
              <input
                required
                value={draft.examType}
                onChange={(e) => field("examType", e.target.value)}
                placeholder="예: 전공의평가시험"
              />
            </label>
            <div className="form-grid">
              <label>
                연도
                <input
                  required
                  type="number"
                  min={1900}
                  max={2200}
                  value={draft.year}
                  onChange={(e) => field("year", Number(e.target.value))}
                />
              </label>
              <label>
                원래 문제번호
                <input
                  required
                  type="number"
                  min={1}
                  max={10000}
                  value={draft.originalNumber}
                  onChange={(e) =>
                    field("originalNumber", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </div>
          <div className="image-pair">
            {(["questionImage", "explanationImage"] as const).map((key, i) => (
              <div className="image-upload" key={key}>
                <span className="field-label">
                  {i === 0 ? "문제 이미지" : "정답·해설 이미지"}
                  {kind === "image" && " *"}
                </span>
                <label
                  className={`upload-zone ${draft[key] ? "has-image" : ""}`}
                >
                  {draft[key] ? (
                    <img
                      src={`/api/v1/images/${draft[key]}`}
                      alt={i === 0 ? "등록할 문제" : "등록할 해설"}
                    />
                  ) : (
                    <>
                      <span className="upload-icon">
                        <Upload size={21} />
                      </span>
                      <strong>
                        {uploading === key
                          ? "이미지 저장 중…"
                          : "이미지 파일 선택"}
                      </strong>
                      <span>PNG · JPG · WebP · GIF / 최대 12MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    aria-label={
                      i === 0 ? "문제 이미지 업로드" : "해설 이미지 업로드"
                    }
                    disabled={!!uploading || busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(file, key);
                      e.target.value = "";
                    }}
                  />
                </label>
                {draft[key] && (
                  <div className="upload-status">
                    <span>
                      <Check size={12} />
                      이미지 저장됨 · 클릭하여 교체
                    </span>
                    <button type="button" onClick={() => field(key, null)}>
                      제거
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {kind === "text" && (
            <>
              <label>
                문제 지문
                <textarea
                  rows={4}
                  required={!draft.questionImage}
                  value={draft.stem}
                  onChange={(e) => field("stem", e.target.value)}
                />
              </label>
              <div className="editor-choices">
                {draft.choices.map((v, i) => (
                  <label key={i}>
                    <span>{digits[i]}</span>
                    <input
                      aria-label={`${i + 1}번 선지`}
                      required={!draft.questionImage}
                      value={v}
                      onChange={(e) =>
                        field(
                          "choices",
                          draft.choices.map((old, j) =>
                            i === j ? e.target.value : old,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          <fieldset className="answer-fieldset">
            <legend>정답 번호</legend>
            <div className="answer-number-row">
              {digits.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  aria-label={`정답 ${i + 1}번`}
                  aria-pressed={draft.correctAnswer === i + 1}
                  className={draft.correctAnswer === i + 1 ? "selected" : ""}
                  onClick={() => field("correctAnswer", i + 1)}
                >
                  {d}
                  {draft.correctAnswer === i + 1 && <Check size={13} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            해설 텍스트 {kind === "image" ? "(선택)" : ""}
            <textarea
              rows={3}
              value={draft.explanation}
              onChange={(e) => field("explanation", e.target.value)}
              placeholder="이미지로 설명하지 못한 내용을 덧붙여도 좋아요."
              required={!draft.explanationImage}
            />
          </label>
          <fieldset className="concept-fieldset">
            <legend>
              <Link2 size={15} />
              관련 개념 연결
            </legend>
            <p className="field-help">
              여러 개를 선택할 수 있습니다. 새 개념과 노트 주소는 문항 관리에서
              등록하세요.
            </p>
            <div className="checkbox-tags">
              {concepts.map((c) => (
                <label
                  key={c.id}
                  className={draft.conceptIds.includes(c.id) ? "checked" : ""}
                >
                  <input
                    type="checkbox"
                    checked={draft.conceptIds.includes(c.id)}
                    onChange={(e) =>
                      field(
                        "conceptIds",
                        e.target.checked
                          ? [...draft.conceptIds, c.id]
                          : draft.conceptIds.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
              {!concepts.length && (
                <small>
                  등록된 개념이 없습니다. 저장 후에도 연결할 수 있습니다.
                </small>
              )}
            </div>
          </fieldset>
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.isDemo}
              onChange={(e) => field("isDemo", e.target.checked)}
            />
            직접 만든 예시 — ‘데모 문항’으로 표시
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy || !!uploading}
              onClick={close}
            >
              취소
            </button>
            <button className="button primary" disabled={busy || !!uploading}>
              {busy ? "저장 중…" : "문항 저장"}
              <Check size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
export function ConceptEditor({
  initial,
  close,
  saved,
}: {
  initial: Concept | null;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name || ""),
    [noahNoteId, setId] = useState(initial?.noahNoteId || ""),
    [externalUrl, setUrl] = useState(initial?.externalUrl || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="modal-backdrop">
      <section
        className="modal small-modal"
        role="dialog"
        aria-modal="true"
        aria-label="개념 연결 관리"
      >
        <button
          className="modal-close icon-button"
          aria-label="닫기"
          disabled={busy}
          onClick={close}
        >
          <X />
        </button>
        <span className="eyebrow">문제와 개념을 잇는 연결</span>
        <h2>{initial ? "개념 연결 수정" : "새 개념 추가"}</h2>
        <p>
          개념의 본문은 NOAH에서 관리하고, 이곳에서는 문제와의 관계를
          보관합니다.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(initial ? `concepts/${initial.id}` : "concepts", {
                method: initial ? "PUT" : "POST",
                body: JSON.stringify({ name, noahNoteId, externalUrl }),
              });
              await saved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            개념 이름
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 자율신경과반사"
              maxLength={160}
            />
          </label>
          <label>
            NOAH 노트 ID (선택)
            <input
              value={noahNoteId}
              onChange={(e) => setId(e.target.value)}
              placeholder="UUID 형식의 노트 ID"
            />
          </label>
          <label>
            외부 노트 열기 URL (선택)
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:3000/#note/UUID"
            />
          </label>
          <p className="field-help">
            실제 노트의 주소를 복사해 넣으세요. ID만으로 주소를 자동 추측하거나
            NOAH 데이터에 접근하지 않습니다. 주소가 바뀌면 여기서 한 번 수정하면
            됩니다.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              취소
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "저장 중…" : "개념 저장"}
              <Plus size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
