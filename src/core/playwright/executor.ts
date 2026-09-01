import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { ComplaintPage } from "../../pages/ComplaintPage.js";
import type { RenderedUiModel, RenderEvidence } from "../models/rendered.js";
import type { TestContext } from "../models/context.js";

export interface ExecutedRender {
  model: RenderedUiModel;
  evidence: RenderEvidence;
}

export function stubUrl(ctx: TestContext): string {
  const base = process.env.STUB_URL ?? "http://127.0.0.1:4173";
  const params = new URLSearchParams();
  if (ctx.dropRenderedPartyId) params.set("drop", ctx.dropRenderedPartyId);
  const qs = params.toString();
  return qs ? `${base}/?${qs}` : `${base}/`;
}

export function liveUrl(): string {
  return process.env.LIVE_URL ?? "";
}

export async function executeAndExtract(page: Page, ctx: TestContext): Promise<ExecutedRender> {
  const target = ctx.uiMode === "live" && liveUrl() ? liveUrl() : stubUrl(ctx);
  await page.goto(target, { waitUntil: "domcontentloaded" });

  const complaint = new ComplaintPage(page);
  const ref = ctx.complaintRef ?? "NC10010449";
  await complaint.enterComplaintReference(ref);
  await complaint.submit();
  await complaint.waitForWorkflowCompletion();

  const customers = await complaint.getCustomerProfiles();
  const complaintRef = await complaint.getComplaintReference();
  const visibleText = await page.locator("body").innerText();

  const evidenceDir = path.join(ctx.reportDir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const shot = path.join(evidenceDir, `${ref}-rendered.png`);
  await page.screenshot({ path: shot, fullPage: true });

  let accessibilitySnapshotPath: string | undefined;
  try {
    const snapshot = await page.locator("body").ariaSnapshot();
    accessibilitySnapshotPath = path.join(evidenceDir, `${ref}-aria.yml`);
    writeFileSync(accessibilitySnapshotPath, snapshot, "utf8");
  } catch {
    accessibilitySnapshotPath = undefined;
  }

  const strategy: RenderedUiModel["strategy"] = customers.length > 0 ? "semantic" : "visual-fallback";

  return {
    model: {
      complaintRef,
      customers,
      visibleText,
      strategy,
    },
    evidence: {
      screenshotPath: path.relative(process.cwd(), shot),
      accessibilitySnapshotPath: accessibilitySnapshotPath
        ? path.relative(process.cwd(), accessibilitySnapshotPath)
        : undefined,
    },
  };
}
