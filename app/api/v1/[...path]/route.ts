import { store, AppError } from "@/lib/store.mjs";
import { ZodError } from "zod";
import { demoContent } from "@/lib/demo.mjs";
import type { Question } from "@/components/types";
import { createBackupDownload } from "@/lib/backup.mjs";
import { updaterRequest } from "@/lib/update-client.mjs";
import packageInfo from "@/package.json";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    const [resource, id, action] = path;
    const url = new URL(req.url),
      method = req.method;
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
    if (!["GET", "HEAD"].includes(method)) {
      const origin = req.headers.get("origin");
      if (origin) {
        let sameOrigin = false;
        try {
          const source = new URL(origin);
          sameOrigin =
            ["http:", "https:"].includes(source.protocol) &&
            source.host === req.headers.get("host");
        } catch {}
        if (!sameOrigin)
          throw new AppError(
            403,
            "다른 사이트에서의 변경 요청은 허용하지 않습니다.",
          );
      }
      if (Number(req.headers.get("content-length")) > 64 * 1024 * 1024)
        throw new AppError(413, "64MB 이하의 파일을 사용하세요.");
    }
    if (resource === "updates") {
      if (method === "GET" && !id) return json(await updaterRequest("status"));
      if (method === "POST" && id === "check")
        return json(await updaterRequest("check", {}), 202);
      if (method === "POST" && id === "apply")
        return json(await updaterRequest("apply", await req.json()), 202);
      throw new AppError(404, "업데이트 API를 찾을 수 없습니다.");
    }
    const db = store();
    if (resource === "backup" && !id && method === "POST") {
      const backup = await createBackupDownload(db.directory);
      return new Response(new Uint8Array(backup.buffer), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${backup.filename}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (resource === "demo" && method === "POST")
      return json(await db.importContent(demoContent));
    if (resource === "health" && method === "GET")
      return json({
        status: "ok",
        app: "pmrzokbo",
        version: process.env.PMRZ_RUNNING_VERSION || packageInfo.version,
        commit: process.env.PMRZ_RUNNING_COMMIT || null,
        apiVersion: 1,
        storage: "sqlite",
        ...db.stats(),
      });
    if (resource === "overview" && method === "GET")
      return json({
        stats: db.stats(),
        sessions: db.sessions(),
        concepts: db.concepts(),
      });
    if (resource === "concepts") {
      if (method === "GET" && id && action === "questions")
        return json({
          apiVersion: 1,
          concept: db.concept(id),
          questions: db.questions({ conceptId: id }).map((q: Question) => ({
            id: q.id,
            title: q.title,
            major: q.major,
            minor: q.minor,
            year: q.year,
            examType: q.examType,
            originalNumber: q.originalNumber,
            path: `/questions/${q.id}`,
          })),
        });
      if (method === "GET") return json(id ? db.concept(id) : db.concepts());
      if (method === "POST" && !id)
        return json(db.saveConcept(await req.json()), 201);
      if (method === "PUT" && id) {
        db.concept(id);
        return json(db.saveConcept({ ...(await req.json()), id }));
      }
    }
    if (resource === "questions") {
      if (method === "GET" && id && action === "history")
        return json(db.history(id));
      if (method === "GET" && id)
        return json(
          db.questions().find((q: Question) => q.id === id) ?? db.question(id),
        );
      if (method === "GET")
        return json(
          db
            .questions(Object.fromEntries(url.searchParams))
            .map((q: Question) => {
              const {
                correctAnswer,
                explanation,
                explanationImage,
                choices,
                stem,
                ...summary
              } = q;
              void correctAnswer;
              void explanation;
              void explanationImage;
              void choices;
              void stem;
              return summary;
            }),
        );
      if (method === "POST" && !id)
        return json(db.saveQuestion(await req.json()), 201);
      if (method === "PUT" && id) {
        db.question(id);
        return json(db.saveQuestion({ ...(await req.json()), id }));
      }
      if (method === "PATCH" && id && action === "personal")
        return json(db.personal(id, await req.json()));
    }
    if (resource === "sessions") {
      if (method === "GET") return json(id ? db.session(id) : db.sessions());
      if (method === "POST" && !id)
        return json(db.createSession(await req.json()), 201);
      if (method === "PATCH" && id)
        return json(db.updateSession(id, await req.json()));
    }
    if (resource === "images") {
      if (method === "GET" && id) {
        const a = db.image(id);
        return new Response(new Uint8Array(a.buffer), {
          headers: {
            "Content-Type": a.mime,
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (method === "POST" && !id) {
        const form = await req.formData(),
          file = form.get("file");
        if (!(file instanceof File))
          throw new AppError(400, "이미지 파일이 필요합니다.");
        return json(
          await db.upload(Buffer.from(await file.arrayBuffer())),
          201,
        );
      }
    }
    if (resource === "export" && method === "GET")
      return new Response(JSON.stringify(db.exportContent(), null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="pmrzokbo-content-v1.json"',
          "Cache-Control": "no-store",
        },
      });
    if (resource === "import" && method === "POST")
      return json(await db.importContent(await req.json()));
    throw new AppError(404, "요청한 API를 찾을 수 없습니다.");
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        { error: error.issues.map((i) => i.message).join(" · ") },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { error: "올바른 JSON 형식이 아닙니다." },
        { status: 400 },
      );
    const e = error as Error & { status?: number };
    if (!e.status) console.error(e);
    return Response.json(
      {
        error: e.status
          ? e.message
          : "요청을 처리하지 못했습니다. 입력 형식과 서버 로그를 확인하세요.",
      },
      { status: e.status || 500 },
    );
  }
}
export const GET = handle,
  POST = handle,
  PUT = handle,
  PATCH = handle;
