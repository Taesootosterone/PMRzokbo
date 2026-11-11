import { homedir } from "node:os";
import { resolve, isAbsolute } from "node:path";
export function dataDirectory() {
  const configured = process.env.PMRZ_DATA_DIR;
  if (configured) {
    if (!isAbsolute(configured))
      throw new Error("PMRZ_DATA_DIR는 절대 경로여야 합니다.");
    return resolve(configured);
  }
  return process.platform === "darwin"
    ? resolve(homedir(), "Library/Application Support/PMRZokbo")
    : resolve(homedir(), ".local/share/pmrzokbo");
}
