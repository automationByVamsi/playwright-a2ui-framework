import { expect, type Locator, type Page } from "@playwright/test";
import { findByType, parseAdkContract } from "../core/parser/adk-contract-parser";
import type { A2UINode, WalkChildren } from "./types";
import { getAdapter } from "./registry";
import { visibleString } from "./humanize";

export type TraceRoot = "summaryBox" | "fact_find" | "analysis";

function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function customerName(node: A2UINode): string {
  for (const grid of findByType([node], "grid")) {
    const name = visibleString(grid.attributes.name);
    if (name) return name;
  }
  return node.label ?? node.path;
}

/**
 * The ADK tree is the POM. Each node.type has an adapter that asserts it on screen.
 *
 * If this fails, open:
 *   1. the Playwright error (label + ADK path)
 *   2. src/engine/adapters/<type>.ts
 */
export async function verifyTraceOnPage(
  page: Page,
  agentOutputTrace: unknown,
  container: Locator,
  roots: TraceRoot[] = ["summaryBox", "fact_find", "analysis"],
): Promise<void> {
  const parsed = parseAdkContract(agentOutputTrace);
  const byPath = new Map(parsed.tree.map((n) => [n.path, n]));

  const walkChildren: WalkChildren = async (children, scope) => {
    for (const child of children) {
      await walkNode(page, child, scope, walkChildren);
    }
  };

  if (roots.includes("summaryBox")) {
    const summary = byPath.get("summaryBox");
    if (summary) await walkNode(page, summary, container, walkChildren);
    const ref = visibleString(rec(parsed.raw.summaryBox ?? parsed.raw.summarybox).complaintReference);
    if (ref) {
      await expect(container.getByText(ref, { exact: false }).first()).toBeVisible();
    }
    await assertGroundednessBanner(parsed.raw, container);
  }

  if (roots.includes("fact_find")) {
    const factFind = byPath.get("fact_find");
    if (factFind) await verifyCustomers(page, factFind, container, walkChildren);
  }

  if (roots.includes("analysis")) {
    const analysis = byPath.get("analysis");
    if (analysis) await verifyAnalysis(page, analysis, container, walkChildren);
  }
}

async function walkNode(page: Page, node: A2UINode, scope: Locator, walkChildren: WalkChildren): Promise<void> {
  if (node.type === "fact_find" || node.path === "analysis") {
    await walkChildren(node.children, scope);
    return;
  }
  const adapter = getAdapter(node.type);
  if (!adapter) {
    await walkChildren(node.children, scope);
    return;
  }
  await adapter.verify(node, scope, page, walkChildren);
}

async function verifyCustomers(
  page: Page,
  factFind: A2UINode,
  container: Locator,
  walkChildren: WalkChildren,
): Promise<void> {
  for (const customer of factFind.children) {
    const name = customerName(customer);
    const tab = page.getByRole("tab", { name });
    if ((await tab.count()) > 0) await tab.click();
    const article = page.getByRole("article", { name });
    const scope = (await article.count()) > 0 ? article : container;
    await expect(scope, `customer "${name}" should be on screen (${customer.path})`).toBeVisible();
    await walkChildren(customer.children, scope);
  }
}

async function verifyAnalysis(
  page: Page,
  analysis: A2UINode,
  container: Locator,
  walkChildren: WalkChildren,
): Promise<void> {
  const analysisTab = page.getByRole("button", { name: /^analysis$/i });
  if ((await analysisTab.count()) > 0) await analysisTab.click();
  const panel = container.locator("#analysis-panel").or(container.getByRole("region", { name: /analysis/i }));
  const scope = (await panel.count()) > 0 ? panel.first() : container;
  await walkChildren(analysis.children, scope);
}

async function assertGroundednessBanner(raw: Record<string, unknown>, container: Locator): Promise<void> {
  const groundedness = rec(raw.groundednessCheck);
  const status = String(groundedness.status ?? "").toLowerCase();
  if (!status) return;
  const banner = container.locator("#groundedness-banner, [data-testid='groundedness-banner']").or(
    container.getByText(/groundedness/i),
  );
  await expect(banner.first(), "groundedness banner").toBeVisible();
  if (status === "correct") {
    await expect(banner.first()).toContainText(/pass/i);
  } else {
    await expect(banner.first()).toHaveAttribute("data-status", /verif|incorrect|fail|warning/i);
  }
}
