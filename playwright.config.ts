import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const uiMode = process.env.UI_MODE ?? "stub";
const stubUrl = process.env.STUB_URL ?? "http://127.0.0.1:4173";
const liveUrl = process.env.LIVE_URL ?? "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/playwright", open: "never" }],
  ],
  use: {
    baseURL: uiMode === "live" && liveUrl ? liveUrl : stubUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: process.env.HEADED === "1" ? false : true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    uiMode === "stub"
      ? {
          command: "npx tsx src/core/playwright/stub-server.ts",
          url: stubUrl,
          reuseExistingServer: !process.env.CI,
          cwd: path.resolve(__dirname),
          stdout: "pipe",
          stderr: "pipe",
        }
      : undefined,
});
