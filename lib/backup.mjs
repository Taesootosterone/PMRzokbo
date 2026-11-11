import { DatabaseSync, backup } from "node:sqlite";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
  renameSync,
  readdirSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { assetPattern } from "./store.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
function safeFile(name) {
  return (
    name === "bank.sqlite" ||
    /^images\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(name)
  );
}
export async function createBackup(directory, destination) {
  if (!existsSync(join(directory, "bank.sqlite")))
    throw new Error("백업할 데이터베이스가 없습니다. 앱을 먼저 실행하세요.");
  const temp = mkdtempSync(join(tmpdir(), "pmrz-backup-"));
  try {
    const live = new DatabaseSync(join(directory, "bank.sqlite"), {
      readOnly: true,
    });
    try {
      await backup(live, join(temp, "bank.sqlite"));
    } finally {
      live.close();
    }
    const snapshot = new DatabaseSync(join(temp, "bank.sqlite"), {
      readOnly: true,
    });
    let assets;
    try {
      if (snapshot.prepare("PRAGMA quick_check").get().quick_check !== "ok")
        throw new Error("DB 무결성 검사 실패");
      assets = snapshot.prepare("SELECT id FROM assets").all();
    } finally {
      snapshot.close();
    }
    const files = ["bank.sqlite", ...assets.map((a) => `images/${a.id}`)].map(
      (path) => {
        if (!safeFile(path)) throw new Error("백업 경로 검사 실패");
        const bytes = readFileSync(
          path === "bank.sqlite" ? join(temp, path) : join(directory, path),
        );
        return {
          path,
          bytes: bytes.length,
          sha256: hash(bytes),
          base64: bytes.toString("base64"),
        };
      },
    );
    const payload = {
      format: "pmrzokbo-full-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      files,
    };
    mkdirSync(dirname(resolve(destination)), { recursive: true });
    writeFileSync(destination, JSON.stringify(payload), {
      flag: "wx",
      mode: 0o600,
    });
    return {
      path: resolve(destination),
      images: assets.length,
      files: files.length,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// 브라우저 다운로드도 CLI와 같은 전체 백업 형식을 사용합니다.
// 사용자 데이터 폴더에 임시 파일을 남기지 않고 실패 시에도 정리합니다.
export async function createBackupDownload(directory) {
  const temp = mkdtempSync(join(tmpdir(), "pmrz-download-"));
  const stamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .replace(" ", "T")
    .replace(/:/g, "-");
  const filename = `pmrzokbo-backup-${stamp}-KST-${randomUUID().slice(0, 8)}.pmrz`;
  try {
    const destination = join(temp, filename);
    await createBackup(directory, destination);
    return { filename, buffer: readFileSync(destination) };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
export function assertStopped(directory) {
  for (const name of [".launcher.lock", ".server.lock"]) {
    const lock = join(/* turbopackIgnore: true */ directory, name);
    if (!existsSync(/* turbopackIgnore: true */ lock)) continue;
    const pid = Number(readFileSync(/* turbopackIgnore: true */ lock, "utf8"));
    if (!Number.isInteger(pid) || pid < 1)
      throw new Error(
        "서버 잠금 파일이 올바르지 않습니다. 실행 상태를 확인하세요.",
      );
    try {
      process.kill(pid, 0);
    } catch (e) {
      if (e.code === "ESRCH") continue;
      throw e;
    }
    throw new Error("실행 중인 앱을 먼저 Ctrl+C로 중지하세요.");
  }
}
export function restoreBackup(
  source,
  directory,
  { confirmOverwrite = false } = {},
) {
  directory = resolve(directory);
  source = resolve(source);
  if (source === directory || source.startsWith(directory + "/"))
    throw new Error("백업 파일을 복원 대상 폴더 밖에 두세요.");
  if (directory === "/" || directory === resolve(tmpdir()))
    throw new Error("별도의 전용 데이터 폴더를 지정하세요.");
  assertStopped(directory);
  const populated = existsSync(directory) && readdirSync(directory).length > 0;
  if (populated && !confirmOverwrite)
    throw new Error(
      "경고: 기존 데이터 전체를 대체합니다. 먼저 백업하고 --confirm-overwrite를 지정하세요.",
    );
  const payload = JSON.parse(readFileSync(source, "utf8"));
  if (
    payload?.format !== "pmrzokbo-full-backup" ||
    payload.version !== 1 ||
    !Array.isArray(payload.files)
  )
    throw new Error(
      "PMRZokbo 전체 백업 v1이 아닙니다. NOAH 백업은 사용할 수 없습니다.",
    );
  const names = new Set();
  for (const f of payload.files) {
    if (!safeFile(f.path) || names.has(f.path))
      throw new Error("잘못된 백업 경로 또는 중복 파일입니다.");
    names.add(f.path);
    const b = Buffer.from(f.base64, "base64");
    if (b.length !== f.bytes || hash(b) !== f.sha256)
      throw new Error("백업 체크섬이 일치하지 않습니다.");
    if (f.path.startsWith("images/") && f.path.slice(7, 71) !== f.sha256)
      throw new Error("이미지 이름과 체크섬이 일치하지 않습니다.");
  }
  if (!names.has("bank.sqlite")) throw new Error("백업에 DB가 없습니다.");
  mkdirSync(dirname(directory), { recursive: true });
  const stage = mkdtempSync(join(dirname(directory), ".pmrz-restore-"));
  let previous = null;
  try {
    mkdirSync(join(stage, "images"), { mode: 0o700 });
    for (const f of payload.files)
      writeFileSync(join(stage, f.path), Buffer.from(f.base64, "base64"), {
        flag: "wx",
        mode: 0o600,
      });
    const db = new DatabaseSync(join(stage, "bank.sqlite"), { readOnly: true });
    try {
      if (
        db.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
        db.prepare("PRAGMA user_version").get().user_version !== 1
      )
        throw new Error("지원하지 않거나 손상된 DB입니다.");
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("DB 연결 무결성 검사 실패");
      for (const a of db.prepare("SELECT id FROM assets").all())
        if (!assetPattern.test(a.id) || !names.has(`images/${a.id}`))
          throw new Error("백업에 필요한 이미지가 없습니다.");
    } finally {
      db.close();
    }
    if (populated) {
      previous = `${directory}.before-restore-${Date.now()}-${randomUUID().slice(0, 6)}`;
      renameSync(directory, previous);
    } else if (existsSync(directory)) rmSync(directory, { recursive: true });
    try {
      renameSync(stage, directory);
    } catch (e) {
      if (previous) renameSync(previous, directory);
      throw e;
    }
    return { directory, previous, files: payload.files.length };
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
