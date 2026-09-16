import { expect, type Locator, type Page } from "@playwright/test";
import type { A2UINode, ComponentAdapter, WalkChildren } from "../types";
import { escapeRegExp, visibleString } from "../humanize";

/**
 * summaryBox / summarybox — title, variant styling hook, and content messages
 * (warning banners, empty-state notices, complaint summary lines).
 */
export const summaryBoxAdapter: ComponentAdapter = {
  type: "summarybox",
  async verify(node: A2UINode, container: Locator, page: Page, walkChildren: WalkChildren) {
    const title = visibleString(node.attributes.title ?? node.label);
    const variant = visibleString(node.attributes.variant ?? node.attributes.variation);
    const message = visibleString(node.attributes.contentText ?? node.attributes.content ?? node.text);

    if (title) {
      await expect(container.getByText(new RegExp(escapeRegExp(title), "i")).first()).toBeVisible();
    }

    if (variant) {
      const styled = page.locator(`[data-variant="${variant}"], .a2ui-summarybox--${variant}, [class*="${variant}"]`);
      const scoped = container.locator(`[data-variant="${variant}"], [class*="${variant}"]`);
      const count = (await scoped.count()) + (await styled.count());
      expect(count, `summarybox variant "${variant}" should be reflected in the DOM`).toBeGreaterThan(0);
    }

    if (message) {
      const firstLine = message.split("\n").map((l) => l.trim()).find(Boolean);
      if (firstLine) {
        await expect(container.getByText(firstLine, { exact: false }).first()).toBeVisible();
      }
    }

    await walkChildren(node.children, container);
  },
};
