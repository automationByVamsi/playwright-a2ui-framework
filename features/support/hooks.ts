import { After, Before, setDefaultTimeout } from "@cucumber/cucumber";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { startStubServer } from "../../src/core/playwright/stub-server.js";
import type { ValidationWorld } from "./world.js";

setDefaultTimeout(60_000);

Before(async () => {
  mkdirSync("reports/validation", { recursive: true });
});

Before({ tags: "@browser" }, async function (this: ValidationWorld) {
  try {
    this.server = await startStubServer(4173);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
  }
  this.browser = await chromium.launch({ headless: true });
  this.page = await this.browser.newPage();
});

After({ tags: "@browser" }, async function (this: ValidationWorld) {
  await this.browser?.close();
  await new Promise<void>((resolve) => {
    if (!this.server) return resolve();
    this.server.close(() => resolve());
  });
});
