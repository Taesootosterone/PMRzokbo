import { resolve } from "node:path";
import { dataDirectory } from "../lib/config.mjs";
import { createBackup, restoreBackup } from "../lib/backup.mjs";
const [action, file, ...args] = process.argv.slice(2);
try {
  if (!file || !["backup", "restore"].includes(action))
    throw new Error(
      "사용법: npm run backup -- /별도/경로/backup.pmrz 또는 npm run restore -- /별도/경로/backup.pmrz [--confirm-overwrite]",
    );
  if (args.some((a) => a !== "--confirm-overwrite"))
    throw new Error("알 수 없는 옵션입니다.");
  const directory = dataDirectory();
  console.log(`데이터 경로: ${directory}`);
  if (action === "restore")
    console.warn(
      "경고: 복원은 전체 교체입니다. 실행 중인 앱을 중지하고 기존 데이터를 먼저 백업하세요. 두 앱의 데이터 병합 기능이 아닙니다.",
    );
  const result =
    action === "backup"
      ? await createBackup(directory, resolve(file))
      : restoreBackup(resolve(file), directory, {
          confirmOverwrite: args.includes("--confirm-overwrite"),
        });
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
