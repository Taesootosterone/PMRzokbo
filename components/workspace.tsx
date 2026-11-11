"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  SlidersHorizontal,
  NotebookPen,
  LibraryBig,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  Check,
  Star,
  CircleHelp,
  PanelLeftClose,
  Activity,
  HardDrive,
  X,
  Link2,
  RefreshCw,
  Play,
  Target,
  Layers,
  ListChecks,
  Settings,
} from "lucide-react";
import { api, type Question, type Overview, type Concept } from "./types";
import { QuestionEditor, ConceptEditor } from "./editor";
import { QuestionPage, SessionPage } from "./solver";
import { SettingsDialog } from "./settings";

const navigation = [
  { href: "/", name: "단원별 학습", icon: BookOpen, sub: "LEARN" },
  {
    href: "/create",
    name: "시험 만들기",
    icon: SlidersHorizontal,
    sub: "PRACTICE",
  },
  { href: "/notebook", name: "마이노트", icon: NotebookPen, sub: "REVIEW" },
  { href: "/manage", name: "문항 관리", icon: LibraryBig, sub: "LIBRARY" },
];
export default function Workspace() {
  const path = usePathname(),
    router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null),
    [questions, setQuestions] = useState<Question[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(""),
    [help, setHelp] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [editor, setEditor] = useState<Question | null | false>(false),
    [conceptEditor, setConceptEditor] = useState<Concept | null | false>(false);
  const refresh = useCallback(async () => {
    try {
      const [o, q] = await Promise.all([
        api<Overview>("overview"),
        api<Question[]>("questions"),
      ]);
      setOverview(o);
      setQuestions(q);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void refresh();
    setMenu(false);
    setSearch("");
  }, [path, refresh]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const notify = (message: string) => setNotice(message);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const start = async (input: Record<string, unknown>) => {
    try {
      const s = await api<{ id: string }>("sessions", {
        method: "POST",
        body: JSON.stringify(input),
      });
      router.push(`/sessions/${s.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const active = navigation.find((n) =>
    n.href === "/" ? path === "/" : path.startsWith(n.href),
  );
  const title =
    active?.name ||
    (path.startsWith("/sessions")
      ? "문제 풀이"
      : path.startsWith("/concepts")
        ? "관련 개념"
        : "문항 보기");
  const concepts = overview?.concepts || [];
  const selected = questions.filter(
    (q) =>
      !search ||
      `${q.title} ${q.major} ${q.minor} ${q.year}년 ${q.examType} ${q.originalNumber}번`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-symbol">
            <Activity size={24} />
          </span>
          <span>
            리햅<span className="brand-en">재활의학 문제은행</span>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">나</span>
          <span>
            나의 재활의학 서재<small>개인 학습 공간</small>
          </span>
          <span className="online-dot" />
        </div>
        <div className="nav-label">나의 학습 공간</div>
        <nav>
          {navigation.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={
                active?.href === n.href ? "nav-item active" : "nav-item"
              }
            >
              <n.icon size={19} />
              <span>{n.name}</span>
              {n.href === "/notebook" && !!overview?.stats.wrong && (
                <span className="nav-count">{overview.stats.wrong}</span>
              )}
              {active?.href === n.href && <ChevronRight size={15} />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tiny-label">작은 반복, 깊은 이해</span>
            <p>
              문제를 풀고 개념을 연결해
              <br />
              나만의 지식을 쌓아보세요.
            </p>
            <span className="tip-line" />
          </div>
          <div className="local-label">
            <HardDrive size={15} />
            <span>내 기기에 안전하게 저장</span>
            <span className="online-dot" />
          </div>
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={16} /> 사용 안내 <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(!menu)}
              aria-label="메뉴 열기"
            >
              <PanelLeftClose size={20} />
            </button>
            <span>나의 서재</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-pill">
              <span className="online-dot" /> 로컬 모드
            </span>
            <span className="top-divider" />
            <button
              className="icon-button settings-button"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
              title="설정"
            >
              <Settings size={20} />
            </button>
            <span className="user-avatar">나</span>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void refresh();
                }}
                aria-label="오류 닫기"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!overview ? (
            <div className="loading">
              <RefreshCw className="spin" /> 서재를 불러오고 있습니다.
            </div>
          ) : (
            <>
              {path === "/" && (
                <>
                  <div className="page-heading">
                    <div>
                      <div className="eyebrow">나의 속도로 쌓아가는 학습</div>
                      <h1>
                        단원별 학습<span className="heading-dot">.</span>
                      </h1>
                      <p>한 문제씩 이해하고, 개념으로 연결하는 나만의 학습.</p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => router.push("/manage")}
                    >
                      <Plus size={16} />
                      문항 등록
                    </button>
                  </div>
                  <section className="welcome-card">
                    <div className="welcome-copy">
                      <span className="welcome-kicker">
                        <span className="online-dot" /> 나의 속도로, 꾸준하게
                      </span>
                      <h2>
                        오늘의 한 문제가
                        <br />
                        내일의 실력이 됩니다.
                      </h2>
                      <p>
                        집중하고 싶은 단원을 골라 시작하세요.
                        <br />
                        풀이에서 해설, 관련 개념까지 한 흐름으로.
                      </p>
                      <button
                        className="button primary"
                        onClick={() =>
                          document
                            .getElementById("units")
                            ?.scrollIntoView({ behavior: "smooth" })
                        }
                      >
                        단원 선택하기 <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="welcome-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="art-note back-note" />
                      <div className="art-note">
                        <div className="art-book">
                          <BookOpen size={33} strokeWidth={1.4} />
                        </div>
                        <span className="art-line long" />
                        <span className="art-line" />
                        <span className="art-line short" />
                        <div className="art-check">
                          <Check size={20} />
                        </div>
                        <span className="art-badge">
                          풀고 · 연결하고 · 기억하기
                        </span>
                      </div>
                      <span className="art-spark spark-one">✧</span>
                      <span className="art-spark spark-two">+</span>
                      <div className="art-chip">
                        <Layers size={17} /> 개념을 잇는 공부
                      </div>
                    </div>
                  </section>
                  <div className="stat-grid">
                    <Stat
                      icon={<LibraryBig size={18} />}
                      name="전체 문항"
                      value={overview.stats.total}
                      unit="문항"
                    />
                    <Stat
                      icon={<Check size={18} />}
                      name="학습한 문항"
                      value={overview.stats.solved}
                      unit="문항"
                    />
                    <Stat
                      icon={<Target size={18} />}
                      name="누적 정답률"
                      value={
                        overview.stats.attempts
                          ? Math.round(
                              (overview.stats.correct /
                                overview.stats.attempts) *
                                100,
                            )
                          : 0
                      }
                      unit="%"
                    />
                    <Stat
                      icon={<NotebookPen size={18} />}
                      name="다시 볼 오답"
                      value={overview.stats.wrong}
                      unit="문항"
                      onClick={() => router.push("/notebook")}
                    />
                  </div>
                  <Resume overview={overview} />
                  <section id="units" className="unit-section">
                    <div className="section-heading">
                      <div>
                        <h2>어떤 단원을 공부할까요?</h2>
                        <p>
                          목차를 선택하면 해당 단원의 문제를 바로 풀 수 있어요.
                        </p>
                      </div>
                      <span className="subtle-count">
                        {new Set(questions.map((q) => q.major)).size}개 대단원
                      </span>
                    </div>
                    <SearchBox
                      value={search}
                      change={setSearch}
                      placeholder="단원, 시험 이름 또는 ‘2022년 전공의평가시험 35번’ 검색"
                    />
                    {search ? (
                      <QuestionList
                        questions={selected}
                        empty="검색 조건에 맞는 문항이 없습니다."
                      />
                    ) : (
                      <UnitGrid questions={questions} start={start} />
                    )}
                    {!questions.length && (
                      <EmptyLibrary
                        onAdd={() => setEditor(null)}
                        onDemo={async () => {
                          try {
                            await api("demo", { method: "POST", body: "{}" });
                            await refresh();
                            notify("직접 만든 데모 문항 2개를 추가했습니다.");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      />
                    )}
                  </section>
                  {!!concepts.length && (
                    <section className="concept-strip">
                      <div>
                        <Link2 size={18} />
                        <h3>개념으로 이어서 보기</h3>
                      </div>
                      <div className="tag-list">
                        {concepts.map((c) => (
                          <Link
                            href={`/concepts/${c.id}`}
                            className="concept-tag"
                            key={c.id}
                          >
                            {c.name}
                            <ArrowUpRight size={13} />
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
              {path === "/create" && (
                <ExamBuilder questions={questions} start={start} />
              )}
              {path === "/notebook" && (
                <Notebook
                  questions={questions}
                  start={start}
                  overview={overview}
                />
              )}
              {path === "/manage" && (
                <Management
                  questions={selected}
                  concepts={concepts}
                  search={search}
                  setSearch={setSearch}
                  onNew={() => setEditor(null)}
                  onEdit={async (id) => {
                    try {
                      setEditor(await api<Question>(`questions/${id}`));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                  onConcept={setConceptEditor}
                  refresh={refresh}
                  notify={notify}
                />
              )}
              {path.startsWith("/questions/") && (
                <QuestionPage
                  key={path}
                  id={path.split("/")[2]}
                  concepts={concepts}
                  start={start}
                  refresh={refresh}
                  notify={notify}
                  onEdit={setEditor}
                />
              )}
              {path.startsWith("/sessions/") && (
                <SessionPage
                  key={path}
                  id={path.split("/")[2]}
                  concepts={concepts}
                  refresh={refresh}
                  notify={notify}
                />
              )}
              {path.startsWith("/concepts/") && (
                <ConceptPage
                  id={path.split("/")[2]}
                  concepts={concepts}
                  questions={questions}
                  start={start}
                  onEdit={setConceptEditor}
                />
              )}
              {!active &&
                !/^\/(questions|sessions|concepts)\/[^/]+$/.test(path) && (
                  <div className="empty-state">
                    <h2>페이지를 찾을 수 없습니다.</h2>
                    <Link href="/">단원별 학습으로 돌아가기</Link>
                  </div>
                )}
            </>
          )}
          <footer className="page-footer">
            <span>
              리햅 <span className="footer-dot">·</span> 재활의학 문제은행
            </span>
            <span>조금씩, 더 단단하게.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role="status" className="toast">
          <Check size={18} />
          {notice}
        </div>
      )}
      {settingsOpen && <SettingsDialog close={closeSettings} />}
      {editor !== false && (
        <QuestionEditor
          initial={editor}
          concepts={concepts}
          close={() => setEditor(false)}
          saved={async () => {
            setEditor(false);
            await refresh();
            notify("문항을 저장했습니다.");
          }}
        />
      )}
      {conceptEditor !== false && (
        <ConceptEditor
          initial={conceptEditor}
          close={() => setConceptEditor(false)}
          saved={async () => {
            setConceptEditor(false);
            await refresh();
            notify("개념 연결 정보를 저장했습니다.");
          }}
        />
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="사용 안내"
            className="modal small-modal"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setHelp(false)}
              aria-label="닫기"
            >
              <X />
            </button>
            <span className="eyebrow">처음 시작하는 나의 문제은행</span>
            <h2>나만의 문제은행 시작하기</h2>
            <p>
              문항 관리에서 문제·해설 이미지를 올리고 정답 번호만 지정하세요.
              이미지에 선지가 있으면 다시 입력하지 않아도 됩니다.
            </p>
            <ol className="help-steps">
              <li>문항 등록 → 대단원·소단원·출처 지정</li>
              <li>단원별 학습 또는 나만의 시험 만들기</li>
              <li>해설 확인 → 관련 개념 → 마이노트 복습</li>
            </ol>
            <p>
              진행 상황은 답 선택마다 서버에 저장됩니다. 화면의 저장 완료 표시를
              확인하세요.
            </p>
            <div className="info-box">
              <HardDrive size={19} />
              <p>
                오른쪽 위 톱니바퀴의 ‘설정 → 전체 백업 다운로드’를 누르면
                DB·이미지·모든 기록을 한 파일로 내려받습니다. 자세한 설치·복원
                방법은 README를 확인하세요.
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  icon,
  name,
  value,
  unit,
  onClick,
}: {
  icon: React.ReactNode;
  name: string;
  value: number;
  unit: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="stat-label">
        {name}
        <span className="stat-icon">{icon}</span>
      </span>
      <span className="stat-number">
        {value.toLocaleString()}
        <small>{unit}</small>
      </span>
    </button>
  );
}
export function SearchBox({
  value,
  change,
  placeholder = "문항 검색",
}: {
  value: string;
  change: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={18} />
      <input
        aria-label="문항 검색"
        placeholder={placeholder}
        value={value}
        onChange={(e) => change(e.target.value)}
      />
      {value && (
        <button aria-label="검색 지우기" onClick={() => change("")}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
function Resume({ overview }: { overview: Overview }) {
  const active = overview.sessions.filter((s) => s.status === "active");
  return active.length ? (
    <div className="resume-list">
      {active.slice(0, 3).map((s) => (
        <Link key={s.id} href={`/sessions/${s.id}`} className="resume-card">
          <span className="resume-icon">
            <Play size={18} />
          </span>
          <div>
            <strong>
              이어서 학습하기{" "}
              <span className="badge neutral">
                {s.mode === "exam" ? "시험 모드" : "학습 모드"}
              </span>
            </strong>
            <p>
              {s.count}문항 중 {s.answered}개 답 선택 ·{" "}
              {new Date(s.createdAt).toLocaleDateString("ko-KR")} 시작
            </p>
          </div>
          <span className="resume-action">
            계속 풀기 <ArrowRight size={16} />
          </span>
        </Link>
      ))}
    </div>
  ) : null;
}
function UnitGrid({
  questions,
  start,
}: {
  questions: Question[];
  start: (i: Record<string, unknown>) => Promise<void>;
}) {
  const majors = [...new Set(questions.map((q) => q.major))];
  return (
    <div className="unit-grid">
      {majors.map((major, i) => {
        const items = questions.filter((q) => q.major === major),
          solved = items.filter((q) => q.latest !== null).length;
        return (
          <article key={major} className="unit-card">
            <div className="unit-card-top">
              <span className={`unit-icon color-${i % 4}`}>
                <BookOpen size={23} strokeWidth={1.5} />
              </span>
              <span className="unit-number">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <div className="unit-title">
              <h3>{major}</h3>
              <span>{items.length}문항</span>
            </div>
            <div className="progress-line">
              <span style={{ width: `${(solved / items.length) * 100}%` }} />
            </div>
            <p className="unit-progress">
              {solved}문항 학습{" "}
              <span>{Math.round((solved / items.length) * 100)}%</span>
            </p>
            <div className="minor-list">
              {[...new Set(items.map((q) => q.minor))].map((minor) => (
                <button
                  key={minor}
                  onClick={() =>
                    void start({
                      mode: "study",
                      filters: { major, minor },
                      order: "original",
                    })
                  }
                >
                  <span>{minor}</span>
                  <small>{items.filter((q) => q.minor === minor).length}</small>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
            <button
              className="unit-start"
              onClick={() =>
                void start({
                  mode: "study",
                  filters: { major },
                  order: "original",
                })
              }
            >
              이 단원 전체 풀기 <ArrowRight size={15} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
function EmptyLibrary({
  onAdd,
  onDemo,
}: {
  onAdd: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <LibraryBig size={30} strokeWidth={1.5} />
      </div>
      <h3>첫 번째 문항을 기다리고 있어요.</h3>
      <p>문제와 해설 이미지를 등록하면 나만의 단원 목차가 만들어집니다.</p>
      <div className="button-row">
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />첫 문항 등록
        </button>
        <button className="button secondary" onClick={onDemo}>
          데모 문항으로 둘러보기
        </button>
      </div>
      <small>데모는 직접 만든 예시이며 실제 기출문항이 아닙니다.</small>
    </div>
  );
}
export function QuestionList({
  questions,
  empty = "아직 문항이 없습니다.",
  edit,
}: {
  questions: Question[];
  empty?: string;
  edit?: (id: string) => void;
}) {
  return !questions.length ? (
    <div className="empty-state compact">
      <BookOpen size={28} />
      <p>{empty}</p>
    </div>
  ) : (
    <div className="question-list">
      {questions.map((q) => (
        <article className="question-row" key={q.id}>
          <span
            className={`question-state ${q.latest === false ? "wrong" : q.latest === true ? "correct" : ""}`}
          >
            {q.latest === null || q.latest === undefined ? (
              <BookOpen size={17} />
            ) : q.latest ? (
              <Check size={18} />
            ) : (
              <RefreshCw size={16} />
            )}
          </span>
          <Link href={`/questions/${q.id}`} className="question-row-main">
            <div className="question-meta">
              {q.major}
              <ChevronRight size={11} />
              {q.minor}
              {q.isDemo && <span className="badge demo">데모 문항</span>}
            </div>
            <h3>{q.title}</h3>
            <p>
              {q.year}년 {q.examType} <span>·</span> {q.originalNumber}번
              {q.starred && <Star className="star-filled" size={13} />}
            </p>
          </Link>
          {edit ? (
            <button
              className="button small secondary"
              onClick={() => edit(q.id)}
            >
              수정
            </button>
          ) : (
            <Link
              href={`/questions/${q.id}`}
              className="question-row-link"
              aria-label={`${q.title} 열기`}
            >
              <ArrowUpRight size={19} />
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
function ExamBuilder({
  questions,
  start,
}: {
  questions: Question[];
  start: (i: Record<string, unknown>) => Promise<void>;
}) {
  const [major, setMajor] = useState(""),
    [minor, setMinor] = useState(""),
    [year, setYear] = useState(""),
    [examType, setExamType] = useState(""),
    [status, setStatus] = useState("all"),
    [count, setCount] = useState(20),
    [mode, setMode] = useState("study"),
    [order, setOrder] = useState("random");
  const matching = questions.filter(
    (q) =>
      (!major || q.major === major) &&
      (!minor || q.minor === minor) &&
      (!year || q.year === Number(year)) &&
      (!examType || q.examType === examType) &&
      (status === "all" ||
        (status === "unseen" && q.latest === null) ||
        (status === "wrong" && q.latest === false) ||
        (status === "starred" && q.starred)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">나에게 맞는 학습 설계</div>
          <h1>
            시험 만들기<span className="heading-dot">.</span>
          </h1>
          <p>필요한 문항을 골라, 나에게 맞는 연습을 시작하세요.</p>
        </div>
      </div>
      <div className="builder-layout">
        <section className="panel builder-panel">
          <div className="number-heading">
            <span>01</span>
            <h2>어떤 문제를 풀까요?</h2>
          </div>
          <div className="form-grid">
            <label>
              대단원
              <select
                aria-label="대단원"
                value={major}
                onChange={(e) => {
                  setMajor(e.target.value);
                  setMinor("");
                }}
              >
                <option value="">모든 단원</option>
                {[...new Set(questions.map((q) => q.major))].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              소단원
              <select
                aria-label="소단원"
                value={minor}
                onChange={(e) => setMinor(e.target.value)}
              >
                <option value="">모든 소단원</option>
                {[
                  ...new Set(
                    questions
                      .filter((q) => !major || q.major === major)
                      .map((q) => q.minor),
                  ),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              시험 종류
              <select
                aria-label="시험 종류"
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
              >
                <option value="">모든 시험</option>
                {[...new Set(questions.map((q) => q.examType))].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              연도
              <select
                aria-label="연도"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">모든 연도</option>
                {[...new Set(questions.map((q) => q.year))]
                  .sort((a, b) => b - a)
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
            <label>
              풀이 상태
              <select
                aria-label="풀이 상태"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">전체 문항</option>
                <option value="unseen">미풀이</option>
                <option value="wrong">최근 오답</option>
                <option value="starred">별표</option>
              </select>
            </label>
          </div>
          <div className="number-heading">
            <span>02</span>
            <h2>학습 방식을 선택하세요.</h2>
          </div>
          <div className="mode-grid">
            {[
              {
                id: "study",
                title: "학습 모드",
                description: "한 문제씩 제출하고 바로 해설 확인",
                icon: BookOpen,
              },
              {
                id: "exam",
                title: "시험 모드",
                description: "자유롭게 답을 바꾸고 마지막에 채점",
                icon: ListChecks,
              },
            ].map((m) => (
              <button
                key={m.id}
                className={`mode-card ${mode === m.id ? "selected" : ""}`}
                onClick={() => setMode(m.id)}
              >
                <m.icon size={23} />
                <strong>{m.title}</strong>
                <span>{m.description}</span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          <div className="number-heading">
            <span>03</span>
            <h2>문항 수와 순서를 정하세요.</h2>
          </div>
          <div className="form-grid">
            <label>
              풀 문항 수
              <input
                type="number"
                min="1"
                max="1000"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <label>
              문항 순서
              <select
                aria-label="문항 순서"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="random">무작위 순서</option>
                <option value="original">원래 순서 (연도·시험·문제번호)</option>
              </select>
            </label>
          </div>
        </section>
        <aside className="panel exam-summary">
          <span className="eyebrow">이번 학습</span>
          <h2>준비됐나요?</h2>
          <span className="summary-count">
            {matching.length}
            <small>문항</small>
          </span>
          <p>선택한 조건에 맞는 문항입니다.</p>
          <div className="summary-details">
            <span>
              학습 방식
              <strong>{mode === "study" ? "학습 모드" : "시험 모드"}</strong>
            </span>
            <span>
              이번에 풀 문항
              <strong>{Math.min(count, matching.length)}문항</strong>
            </span>
            <span>
              문항 순서
              <strong>{order === "random" ? "무작위" : "원래 순서"}</strong>
            </span>
          </div>
          <button
            className="button primary full-width"
            disabled={
              !matching.length ||
              !Number.isInteger(count) ||
              count < 1 ||
              count > 1000
            }
            onClick={() =>
              void start({
                mode,
                count,
                order,
                filters: {
                  major,
                  minor,
                  year: year ? Number(year) : undefined,
                  examType,
                  status,
                },
              })
            }
          >
            학습 시작하기 <ArrowRight size={17} />
          </button>
          <p className="summary-note">
            <HardDrive size={14} /> 답과 진행 상황은 자동 저장됩니다.
          </p>
        </aside>
      </div>
    </>
  );
}
function Notebook({
  questions,
  start,
  overview,
}: {
  questions: Question[];
  overview: Overview;
  start: (i: Record<string, unknown>) => Promise<void>;
}) {
  const [tab, setTab] = useState("wrong"),
    [search, setSearch] = useState("");
  const filtered = questions.filter(
    (q) =>
      (tab === "wrong"
        ? q.latest === false
        : tab === "starred"
          ? q.starred
          : !!q.memo.trim()) &&
      (!search || `${q.title} ${q.minor} ${q.memo}`.includes(search)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">다시 풀고, 오래 기억하기</div>
          <h1>
            마이노트<span className="heading-dot">.</span>
          </h1>
          <p>다시 만난 문제에서, 더 확실한 이해를 발견하세요.</p>
        </div>
        <button
          className="button primary"
          disabled={!filtered.length}
          onClick={() =>
            void start({
              mode: "study",
              questionIds: filtered.map((q) => q.id),
              order: "original",
            })
          }
        >
          <RefreshCw size={16} />
          현재 목록 다시 풀기
        </button>
      </div>
      <div className="tabs">
        {[
          {
            id: "wrong",
            name: "최근 오답",
            n: questions.filter((q) => q.latest === false).length,
          },
          {
            id: "starred",
            name: "별표",
            n: questions.filter((q) => q.starred).length,
          },
          {
            id: "memo",
            name: "메모한 문항",
            n: questions.filter((q) => q.memo.trim()).length,
          },
        ].map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "selected" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.name}
            <span>{t.n}</span>
          </button>
        ))}
      </div>
      <SearchBox value={search} change={setSearch} />
      <p className="list-caption">
        {tab === "wrong"
          ? "가장 최근 시도에서 틀린 문항입니다. 다시 맞히면 이 목록에서 빠지고 이전 기록은 남습니다."
          : tab === "starred"
            ? "별표는 정답 여부와 관계없이 보관됩니다."
            : "메모를 남긴 문항을 모았습니다."}
      </p>
      <QuestionList
        questions={filtered}
        empty={
          tab === "wrong"
            ? "현재 최근 오답이 없습니다."
            : tab === "starred"
              ? "문제를 풀며 별표를 눌러보세요."
              : "문제 화면에서 나만의 메모를 남겨보세요."
        }
      />
      <div className="section-heading history-heading">
        <div>
          <h2>최근 학습 기록</h2>
          <p>제출한 풀이와 진행 중인 시험을 확인하세요.</p>
        </div>
      </div>
      <div className="session-history">
        {overview.sessions.map((s) => (
          <Link key={s.id} href={`/sessions/${s.id}`}>
            <span className="session-history-icon">
              {s.status === "completed" ? (
                <Check size={20} />
              ) : (
                <Play size={18} />
              )}
            </span>
            <div>
              <strong>
                {s.mode === "exam" ? "맞춤 시험" : "단원 학습"} · {s.count}문항
              </strong>
              <p>{new Date(s.createdAt).toLocaleString("ko-KR")}</p>
            </div>
            <span
              className={`badge ${s.status === "completed" ? "neutral" : "mint"}`}
            >
              {s.status === "completed" ? "제출 완료" : "진행 중"}
            </span>
            <ChevronRight size={17} />
          </Link>
        ))}
        {!overview.sessions.length && (
          <p className="list-caption">학습을 시작하면 이곳에 기록됩니다.</p>
        )}
      </div>
    </>
  );
}
function Management({
  questions,
  concepts,
  search,
  setSearch,
  onNew,
  onEdit,
  onConcept,
  refresh,
  notify,
}: {
  questions: Question[];
  concepts: Concept[];
  search: string;
  setSearch: (s: string) => void;
  onNew: () => void;
  onEdit: (id: string) => Promise<void>;
  onConcept: (c: Concept | null) => void;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function importFile(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 64 * 1024 * 1024)
        throw new Error("64MB 이하 JSON을 사용하세요.");
      const data = await api<{
        addedQuestions: number;
        addedConcepts: number;
        addedLinks: number;
        skippedQuestions: number;
      }>("import", { method: "POST", body: await file.text() });
      await refresh();
      notify(
        `문항 ${data.addedQuestions}개 · 개념 ${data.addedConcepts}개 · 연결 ${data.addedLinks}개 추가 (기존 문항 ${data.skippedQuestions}개 유지)`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">나만의 문항 서재</div>
          <h1>
            문항 관리<span className="heading-dot">.</span>
          </h1>
          <p>문제와 해설 한 쌍으로, 나만의 문제은행을 채워보세요.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />새 문항 등록
        </button>
      </div>
      <div className="management-tools">
        <div>
          <a className="button secondary" href="/api/v1/export">
            문항 JSON 내보내기 <ArrowUpRight size={14} />
          </a>
          <label
            className={`button secondary file-button ${busy ? "disabled" : ""}`}
          >
            {busy ? "가져오는 중…" : "JSON 일괄 가져오기"}
            <input
              aria-label="JSON 파일 가져오기"
              disabled={busy}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <span>기존 ID의 내용은 유지하고 연결은 합칩니다.</span>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <SearchBox value={search} change={setSearch} />
      <div className="list-caption">
        총 {questions.length}문항 · 이미지는 원본 비율로 보관됩니다.
      </div>
      <QuestionList questions={questions} edit={onEdit} />
      <section className="panel concepts-manager">
        <div className="section-heading">
          <div>
            <h2>관련 개념과 NOAH 연결</h2>
            <p>
              개념의 노트 주소를 한 번 등록하면 연결된 모든 문항에서 열 수
              있습니다.
            </p>
          </div>
          <button
            className="button secondary small"
            onClick={() => onConcept(null)}
          >
            <Plus size={14} />
            개념 추가
          </button>
        </div>
        {concepts.map((c) => (
          <div key={c.id} className="concept-manager-row">
            <Link href={`/concepts/${c.id}`}>
              <Link2 size={17} />
              <strong>{c.name}</strong>
              <span>{c.externalUrl ? "외부 노트 연결됨" : "노트 미연결"}</span>
            </Link>
            <button className="text-button" onClick={() => onConcept(c)}>
              연결 수정
            </button>
          </div>
        ))}
        {!concepts.length && (
          <p className="list-caption">
            개념을 추가한 다음 문항 편집에서 연결하세요. 개념 본문은 NOAH에서
            편집합니다.
          </p>
        )}
      </section>
      <div className="backup-note">
        <HardDrive size={23} />
        <div>
          <h3>내 학습 데이터, 빠짐없이 보관하기</h3>
          <p>
            JSON 내보내기는 문항·개념·연결·이미지 이동용입니다. 풀이
            기록·별표·메모·진행 중인 시험까지 보존하려면 오른쪽 위 톱니바퀴의
            <strong> 설정 → 전체 백업 다운로드</strong>를 사용하세요.
          </p>
          <span className="field-help">
            DB·이미지·모든 학습 기록을 한 파일로 보관합니다.
          </span>
        </div>
      </div>
    </>
  );
}
function ConceptPage({
  id,
  concepts,
  questions,
  start,
  onEdit,
}: {
  id: string;
  concepts: Concept[];
  questions: Question[];
  start: (i: Record<string, unknown>) => Promise<void>;
  onEdit: (c: Concept) => void;
}) {
  const c = concepts.find((c) => c.id === id);
  if (!c) return <div className="empty-state">개념을 찾을 수 없습니다.</div>;
  const items = questions.filter((q) => q.conceptIds.includes(id));
  return (
    <>
      <Link className="back-link" href="/">
        ← 단원별 학습
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">개념으로 연결되는 학습</div>
          <h1>{c.name}</h1>
          <p>이 개념에 연결된 {items.length}개의 문제를 함께 살펴보세요.</p>
        </div>
        <button className="button secondary" onClick={() => onEdit(c)}>
          노트 연결 수정
        </button>
      </div>
      <section className="concept-detail-banner">
        <span className="concept-large-icon">
          <Link2 size={28} />
        </span>
        <div>
          <strong>문제는 이곳에서, 개념은 나의 노트에서.</strong>
          <p>
            {c.externalUrl
              ? "등록한 외부 노트를 새 창에서 엽니다. 노트 접근 권한은 NOAH에서 확인합니다."
              : "NOAH를 연결하지 않아도 이 개념의 문제를 풀 수 있습니다."}
          </p>
        </div>
        {c.externalUrl && (
          <a
            className="button secondary"
            href={c.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            외부 노트 열기 <ArrowUpRight size={16} />
          </a>
        )}
      </section>
      <div className="section-heading">
        <h2>연결된 문항</h2>
        <button
          className="button primary small"
          disabled={!items.length}
          onClick={() =>
            void start({ mode: "study", questionIds: items.map((q) => q.id) })
          }
        >
          이 개념 문제 풀기 <ArrowRight size={15} />
        </button>
      </div>
      <QuestionList questions={items} />
      <p className="id-caption">개념 ID · {c.id}</p>
    </>
  );
}
