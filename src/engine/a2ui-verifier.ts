import { expect, type Locator, type Page } from "@playwright/test";
import { findByType, parseAdkContract } from "../core/parser/adk-contract-parser.js";
import type { A2UINode, WalkChildren } from "./types.js";
import { getAdapter } from "./registry.js";
import { visibleString } from "./humanize.js";

export interface A2UIVerifierOptions {
  /** Limit which top-level ADK roots are walked. Default: summaryBox + fact_find + analysis. */
  roots?: Array<"summaryBox" | "fact_find" | "analysis">;
}

function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function customerName(node: A2UINode): string {
  const grids = findByType([node], "grid");
  for (const grid of grids) {
    const name = visibleString(grid.attributes.name);
    if (name) return name;
  }
  return node.label ?? node.path;
}

/**
 * Trace-to-DOM recursive traversal. The ADK tree is the test spec;
 * adapters decide how each `type` is proven in the live (or stub) document.
 *
 * Customer count, product cards, and empty-state accordions scale automatically
 * because the walker follows whatever `fact_find.customers` contains.
 */
export class A2UIVerifier {
  constructor(
    private readonly page: Page,
    private readonly options: A2UIVerifierOptions = {},
  ) {}

  async verify(agentOutputTrace: unknown, container: Locator): Promise<void> {
    const parsed = parseAdkContract(agentOutputTrace);
    const roots = this.options.roots ?? ["summaryBox", "fact_find", "analysis"];
    const byPath = new Map(parsed.tree.map((n) => [n.path, n]));

    if (roots.includes("summaryBox")) {
      const summary = byPath.get("summaryBox");
      if (summary) await this.walkNode(summary, container);
      const ref = visibleString(rec(parsed.raw.summaryBox ?? parsed.raw.summarybox).complaintReference);
      if (ref) {
        await expect(container.getByText(ref, { exact: false }).first()).toBeVisible();
      }
      await this.assertGroundednessBanner(parsed.raw, container);
    }

    if (roots.includes("fact_find")) {
      const factFind = byPath.get("fact_find");
      if (factFind) await this.verifyCustomers(factFind, container);
    }

    if (roots.includes("analysis")) {
      const analysis = byPath.get("analysis");
      if (analysis) await this.verifyAnalysis(analysis, container);
    }
  }

  private walkChildren: WalkChildren = async (children, scope) => {
    for (const child of children) {
      await this.walkNode(child, scope);
    }
  };

  private async walkNode(node: A2UINode, scope: Locator): Promise<void> {
    if (node.type === "fact_find" || node.path === "analysis") {
      await this.walkChildren(node.children, scope);
      return;
    }
    const adapter = getAdapter(node.type);
    if (!adapter) {
      // Unknown catalog type: still recurse so new wrappers don't brick the walk.
      // Register a real adapter in src/engine/registry.ts when the component is testable.
      await this.walkChildren(node.children, scope);
      return;
    }
    await adapter.verify(node, scope, this.page, this.walkChildren);
  }

  private async verifyCustomers(factFind: A2UINode, container: Locator): Promise<void> {
    for (const customer of factFind.children) {
      const name = customerName(customer);
      const tab = this.page.getByRole("tab", { name });
      if ((await tab.count()) > 0) {
        await tab.click();
      }
      const article = this.page.getByRole("article", { name });
      const scope = (await article.count()) > 0 ? article : container;
      await expect(scope, `customer surface for ${name}`).toBeVisible();
      await this.walkChildren(customer.children, scope);
    }
  }

  private async verifyAnalysis(analysis: A2UINode, container: Locator): Promise<void> {
    const analysisTab = this.page.getByRole("button", { name: /^analysis$/i });
    if ((await analysisTab.count()) > 0) {
      await analysisTab.click();
    }
    const panel = container.locator("#analysis-panel").or(container.getByRole("region", { name: /analysis/i }));
    const scope = (await panel.count()) > 0 ? panel.first() : container;
    await this.walkChildren(analysis.children, scope);
  }

  private async assertGroundednessBanner(raw: Record<string, unknown>, container: Locator): Promise<void> {
    const groundedness = rec(raw.groundednessCheck);
    const status = String(groundedness.status ?? "").toLowerCase();
    if (!status) return;
    const banner = container.locator("#groundedness-banner, [data-testid='groundedness-banner']").or(
      container.getByText(/groundedness/i),
    );
    await expect(banner.first()).toBeVisible();
    if (status === "correct") {
      await expect(banner.first()).toContainText(/pass/i);
    } else {
      await expect(banner.first()).toHaveAttribute("data-status", /verif|incorrect|fail|warning/i);
    }
  }
}
