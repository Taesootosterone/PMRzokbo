export interface Concept {
  id: string;
  name: string;
  noahNoteId: string;
  externalUrl: string;
}
export interface Question {
  id: string;
  title: string;
  major: string;
  minor: string;
  examType: string;
  year: number;
  originalNumber: number;
  stem?: string;
  choices?: string[];
  correctAnswer?: number;
  explanation?: string;
  questionImage: string | null;
  explanationImage?: string | null;
  isDemo: boolean;
  conceptIds: string[];
  starred: boolean;
  memo: string;
  latest: boolean | null;
  attemptCount: number;
}
export interface Session {
  id: string;
  mode: "study" | "exam";
  status: "active" | "completed";
  index: number;
  answers: Record<string, number>;
  revealed: string[];
  questions: Question[];
  createdAt: string;
  revision: number;
}
export interface SessionSummary {
  id: string;
  mode: "study" | "exam";
  status: string;
  count: number;
  answered: number;
  index: number;
  createdAt: string;
}
export interface Overview {
  stats: {
    total: number;
    solved: number;
    wrong: number;
    starred: number;
    attempts: number;
    correct: number;
  };
  concepts: Concept[];
  sessions: SessionSummary[];
}
export interface History {
  id: string;
  sessionId: string;
  selected: number | null;
  correct: boolean;
  createdAt: string;
  snapshot: Question;
}
export const digits = ["①", "②", "③", "④", "⑤"];
export async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
  return data;
}
