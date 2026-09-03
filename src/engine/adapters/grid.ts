import { expect, type Locator, type Page } from "@playwright/test";
import type { A2UINode, ComponentAdapter, WalkChildren } from "../types.js";
import { escapeRegExp, humanizeKey, visibleString } from "../humanize.js";

const SKIP_ATTR = new Set(["type", "className", "defaultOpen", "contentText", "variation", "variant", "mode"]);

/**
 * Grid — flat key → value. `time_with_bank` is asserted as the visible label "time with bank".
 */
export const gridAdapter: ComponentAdapter = {
  type: "grid",
  async verify(node: A2UINode, container: Locator, _page: Page, _walkChildren: WalkChildren) {
    for (const [key, raw] of Object.entries(node.attributes)) {
      if (SKIP_ATTR.has(key)) continue;
      const value = visibleString(raw);
      if (!value) continue;
      const label = humanizeKey(key);
      await expect(
        container.getByText(new RegExp(escapeRegExp(label), "i")).first(),
        `grid label "${label}" (${node.path})`,
      ).toBeVisible();
      await expect(container.getByText(value, { exact: false }).first(), `grid value for "${label}"`).toBeVisible();
    }
    await _walkChildren(node.children, container);
  },
};
