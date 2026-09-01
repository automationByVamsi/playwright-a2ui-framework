import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig, cucumberReporter } from "playwright-bdd";
import dotenv from "dotenv";

const envFile = process.env.ENV_FILE_NAME ?? ".env.ui";
dotenv.config({ path: path.resolve(__dirname, "../env", envFile) });

function convertToBoolean(value: string | undefined, fallback = true): boolean {
  if (value === undefined || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(value.toLowerCase());
}

const hiveUi = process.env.HIVE_UI?.trim();
const stubUrl = process.env.STUB_URL ?? "http://127.0.0.1:4173";
const useStub = !hiveUi;

const testDir = defineBddConfig({
  featuresRoot: "..",
  features: "../features/ui/**/*.feature",
  steps: ["../step-definitions/ui/**/*.{ts,js}", "../hooks/ui-hooks.ts"],
  outputDir: "../features-gen",
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: hiveUi
    ? Number(process.env.FACTFIND_RESPONSE_READY_TIMEOUT_MS ?? 180_000)
    : Number(process.env.FACTFIND_RESPONSE_READY_TIMEOUT_MS ?? 60_000),
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/playwright-ui", open: "never" }],
    cucumberReporter("json", { outputFile: "reports/cucumber-ui.json" }),
  ],
  use: {
    baseURL: hiveUi || stubUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: convertToBoolean(process.env.HEADLESS_MODE, true),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useStub
    ? {
        command: "npx tsx src/core/playwright/stub-server.ts",
        url: stubUrl,
        reuseExistingServer: !process.env.CI,
        cwd: path.resolve(__dirname, ".."),
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
