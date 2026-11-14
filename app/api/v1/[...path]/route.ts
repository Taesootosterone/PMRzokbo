import { store, AppError } from "@/lib/store.mjs";
import { ZodError } from "zod";
import { demoContent } from "@/lib/demo.mjs";
import type { Question } from "@/components/types";
import { createBackupDownload } from "@/lib/backup.mjs";
import { updaterRequest } from "@/lib/update-client.mjs";
import packageInfo from "@/package.json";
import {
  acceptPresentation,
  acceptRenderPdf,
  listJobs,
  getJob,
  jobDirectory,
  startJob,
  cancelJob,
  regroupJob,
  commitJob,
  deleteJob,
  saveReview,
} from "@/lib/ppt-jobs.mjs";
import { pptCapabilities } from "@/lib/ppt-local.mjs";
import { MAX_PPT_BYTES } from "@/lib/ppt-model.mjs";
import { readFileSync, createReadStream, statSync, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
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
      const limit =
        resource === "ppt-imports" && (!id || action === "pdf")
          ? MAX_PPT_BYTES
          : 64 * 1024 * 1024;
      if (Number(req.headers.get("content-length")) > limit)
        throw new AppError(
          413,
          resource === "ppt-imports"
            ? "PPTX·PDF는 각각 256MB 이하로 나누어 주세요."
            : "64MB 이하의 파일을 사용하세요.",
        );
    }
    if (resource === "updates") {
      if (method === "GET" && !id) return json(await updaterRequest("status"));
      if (method === "POST" && id === "check")
        return json(await updaterRequest("check", {}), 202);
      if (method === "POST" && id === "apply")
        return json(await updaterRequest("apply", await req.json()), 202);
      throw new AppError(404, "업데이트 API를 찾을 수 없습니다.");
    }
    if (resource === "desktop") {
      if (method === "GET" && !id) return json(await updaterRequest("desktop"));
      if (method === "POST" && id === "install")
        return json(await updaterRequest("desktop", {}));
      if (method === "POST" && id === "stop")
        return json(await updaterRequest("stop", {}), 202);
      throw new AppError(404, "Mac 앱 API를 찾을 수 없습니다.");
    }
    const db = store();
    if (resource === "ppt-imports") {
      try {
        if (!id && method === "GET")
          return json({
            capabilities: pptCapabilities(),
            jobs: listJobs(db.directory),
          });
        if (!id && method === "POST")
          return json(await acceptPresentation(req, db.directory), 202);
        if (id && !action && method === "GET")
          return json(getJob(db.directory, id));
        if (id && !action && method === "PATCH")
          return json(regroupJob(db.directory, id, await req.json()));
        if (id && action === "retry" && method === "POST") {
          const options = await req.json().catch(() => ({}));
          return json(
            startJob(db.directory, id, {
              renderMode: ["office", "pdf"].includes(options.renderMode)
                ? options.renderMode
                : "native",
            }),
            202,
          );
        }
        if (id && action === "cancel" && method === "POST")
          return json(cancelJob(db.directory, id));
        if (id && action === "commit" && method === "POST")
          return json(await commitJob(db, id, await req.json()));
        if (id && action === "draft" && method === "POST")
          return json(saveReview(db.directory, id, await req.json()));
        if (id && action === "pdf" && method === "POST")
          return json(await acceptRenderPdf(req, db.directory, id), 202);
        if (id && action === "pdf" && method === "GET") {
          const job = getJob(db.directory, id),
            dir = jobDirectory(db.directory, id);
          const file = join(
            /* turbopackIgnore: true */ dir,
            job.renderMode === "native"
              ? "native"
              : job.renderMode === "pdf"
                ? "."
                : "render",
            job.renderMode === "pdf" ? "render-input.pdf" : "source.pdf",
          );
          if (!job.pdfReady || !existsSync(/* turbopackIgnore: true */ file))
            throw new AppError(404, "PDF 생성이 아직 끝나지 않았습니다.");
          const filename = job.filename.replace(/\.pptx$/i, ".pdf");
          return new Response(
            Readable.toWeb(
              createReadStream(/* turbopackIgnore: true */ file),
            ) as ReadableStream,
            {
              headers: {
                "Content-Type": "application/pdf",
                "Content-Length": String(
                  statSync(/* turbopackIgnore: true */ file).size,
                ),
                "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="pmrzokbo-converted.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
                "Cache-Control": "no-store",
              },
            },
          );
        }
        if (id && action === "slides" && method === "GET") {
          const n = Number(path[3]),
            job = getJob(db.directory, id);
          if (!Number.isInteger(n) || n < 1 || n > (job.totalSlides || 0))
            throw new AppError(404, "슬라이드를 찾을 수 없습니다.");
          const thumb = url.searchParams.get("thumb") === "1";
          return new Response(
            new Uint8Array(
              readFileSync(
                /* turbopackIgnore: true */
                join(
                  /* turbopackIgnore: true */
                  jobDirectory(db.directory, id),
                  thumb ? "thumbs" : "slides",
                  `${n}.${thumb ? "jpg" : "png"}`,
                ),
              ),
            ),
            {
              headers: {
                "Content-Type": thumb ? "image/jpeg" : "image/png",
                "Cache-Control": "private, max-age=3600",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        }
        if (id && !action && method === "DELETE") {
          return json(deleteJob(db.directory, id));
        }
        throw new AppError(404, "PPT 가져오기 API를 찾을 수 없습니다.");
      } catch (error) {
        const e = error as Error & { status?: number };
        throw new AppError(e.status || 400, e.message);
      }
    }
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
        instanceId: process.env.PMRZ_INSTANCE_ID || null,
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
              if (summary.source)
                summary.source = { ...summary.source, explanationText: "" };
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
  PATCH = handle,
  DELETE = handle;
