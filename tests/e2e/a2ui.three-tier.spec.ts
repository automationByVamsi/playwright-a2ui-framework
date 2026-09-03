import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ComplaintPage } from "../../src/pages/ComplaintPage.js";
import { validateGroundednessContract, assertGroundednessContract } from "../../src/validators/groundedness-contract.validator.js";
import { A2UIVerifier } from "../../src/engine/a2ui-verifier.js";
import { mockAdkTrace, fetchMockedAdkTrace } from "../../src/engine/fixtures/adk-trace-route.js";

const aggregated = JSON.parse(readFileSync(path.resolve("fixtures/NC10010449.json"), "utf8"));
const trace = JSON.parse(readFileSync(path.resolve("fixtures/adk_NC10010449.json"), "utf8"));

/**
 * Complete 3-tier flow for NC10010449.
 *
 * Adding a new A2UI catalog type (timeline, data-table, ...):
 *   src/engine/adapters/<type>.ts implementing ComponentAdapter
 *   then registerAdapter(...) in src/engine/registry.ts
 */
test.describe("A2UI three-tier validation — NC10010449", () => {
  test("Tier 1 then recursive DOM verify then a11y + scoped screenshots", async ({ page }) => {
    await mockAdkTrace(page, trace);

    const tier1 = validateGroundednessContract(aggregated, trace);
    assertGroundednessContract(tier1);
    expect(tier1.checks.every((c) => c.passed)).toBe(true);

    const complaint = new ComplaintPage(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await complaint.enterComplaintReference("NC10010449");
    await complaint.submit();
    await complaint.waitForWorkflowCompletion();

    const routed = (await fetchMockedAdkTrace(page)) as { complaintRef?: string; agentOutput?: string };
    expect(routed.agentOutput ?? routed.complaintRef).toBeTruthy();

    const main = page.locator("#main-content");
    await expect(main).toBeVisible();
    const verifier = new A2UIVerifier(page);
    await verifier.verify(trace, main);

    const axe = await new AxeBuilder({ page }).include("#main-content").withTags(["wcag2a", "wcag21aa"]).analyze();
    expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

    await expect(page.locator("#groundedness-banner")).toHaveScreenshot("groundedness-banner.png", {
      maxDiffPixelRatio: 0.02,
    });
    await page.getByRole("button", { name: /fact finder/i }).click();
    await page.getByRole("tab", { name: /Alexandra Taylor/i }).click();
    await expect(page.locator(".a2ui-callout--support")).toHaveScreenshot("support-needs-callout.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
