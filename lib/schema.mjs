import { z } from "zod";
export const entityId = z
  .string()
  .regex(/^[qc]_[0-9a-f-]{36}$/, "문항·개념 ID 형식을 확인하세요.");
export const conceptSchema = z.object({
  id: z
    .string()
    .regex(/^c_[0-9a-f-]{36}$/)
    .optional(),
  name: z.string().trim().min(1).max(160),
  noahNoteId: z.union([z.uuid(), z.literal("")]).default(""),
  externalUrl: z
    .string()
    .max(2048)
    .refine((value) => {
      if (!value) return true;
      try {
        const u = new URL(value);
        return (
          ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
        );
      } catch {
        return false;
      }
    }, "외부 노트 주소는 사용자 정보가 없는 HTTP(S) URL이어야 합니다.")
    .default(""),
});
export const questionSchema = z
  .object({
    id: z
      .string()
      .regex(/^q_[0-9a-f-]{36}$/)
      .optional(),
    title: z.string().trim().min(1).max(240),
    major: z.string().trim().min(1).max(100),
    minor: z.string().trim().min(1).max(100),
    examType: z.string().trim().min(1).max(100),
    year: z.number().int().min(1900).max(2200),
    originalNumber: z.number().int().min(1).max(10000),
    stem: z.string().max(50000).default(""),
    choices: z
      .array(z.string().max(5000))
      .length(5)
      .default(["", "", "", "", ""]),
    correctAnswer: z.number().int().min(1).max(5),
    explanation: z.string().max(50000).default(""),
    questionImage: z
      .string()
      .regex(/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/)
      .nullable()
      .default(null),
    explanationImage: z
      .string()
      .regex(/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/)
      .nullable()
      .default(null),
    isDemo: z.boolean().default(false),
    conceptIds: z
      .array(z.string().regex(/^c_[0-9a-f-]{36}$/))
      .max(100)
      .default([]),
  })
  .superRefine((q, ctx) => {
    if (
      !q.questionImage &&
      (!q.stem.trim() || q.choices.some((c) => !c.trim()))
    )
      ctx.addIssue({
        code: "custom",
        message: "텍스트형은 지문과 선지 5개가 필요합니다.",
      });
    if (!q.explanationImage && !q.explanation.trim())
      ctx.addIssue({
        code: "custom",
        message: "해설 이미지 또는 해설 내용을 입력하세요.",
      });
  });
export const filterSchema = z.object({
  major: z.string().optional(),
  minor: z.string().optional(),
  examType: z.string().optional(),
  year: z.coerce.number().int().optional(),
  status: z.enum(["all", "unseen", "wrong", "starred", "memo"]).default("all"),
  search: z.string().max(300).optional(),
  conceptId: z.string().optional(),
});
