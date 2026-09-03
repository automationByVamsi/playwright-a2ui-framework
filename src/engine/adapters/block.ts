import { expect, type Locator, type Page } from "@playwright/test";
import type { A2UINode, ComponentAdapter, WalkChildren } from "../types.js";
import { visibleString } from "../humanize.js";

/**
 * Block — section label, status tag (e.g. "No recent change of address"), multi-line text.
 */
export const blockAdapter: ComponentAdapter = {
  type: "block",
  async verify(node: A2UINode, container: Locator, _page: Page, walkChildren: WalkChildren) {
    const label = visibleString(node.label);
    if (label) {
      await expect(container.getByText(label, { exact: false }).first()).toBeVisible();
    }

    const body = visibleString(node.text);
    if (body) {
      for (const line of body.split("\n").map((l) => l.trim()).filter(Boolean)) {
        await expect(container.getByText(line, { exact: false }).first()).toBeVisible();
      }
    }

    const tag = visibleString(node.attributes.tag);
    if (tag) {
      await expect(container.getByText(tag, { exact: false }).first()).toBeVisible();
    }

    await walkChildren(node.children, container);
  },
};
