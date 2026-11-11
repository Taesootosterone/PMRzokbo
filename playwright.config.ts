import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdateFixture } from "./test/helpers/update-fixture.mjs";
process.env.PMRZ_E2E_DIR ||= mkdtempSync(join(tmpdir(), "pmrz-browser-"));
const fixture = createUpdateFixture(process.env.PMRZ_E2E_DIR, process.cwd());
export default defineConfig({
  testDir: "./test/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    actionTimeout: 15000,
    baseURL: "http://127.0.0.1:14310",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:14310/api/v1/health",
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      PMRZ_DATA_DIR: join(process.env.PMRZ_E2E_DIR, "primary"),
      PMRZ_PORT: "14310",
      PMRZ_HOST: "127.0.0.1",
      PMRZ_AUTO_UPDATE_CHECK: "0",
      PMRZ_UPDATE_READY_TIMEOUT_MS: "6000",
      PATH: `${fixture.bin}:${process.env.PATH || ""}`,
    },
  },
});
