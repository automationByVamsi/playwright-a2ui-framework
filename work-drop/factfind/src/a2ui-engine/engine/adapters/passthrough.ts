import { expect, type Locator, type Page } from "@playwright/test";
import type { A2UINode, ComponentAdapter, WalkChildren } from "../types";
import { visibleString } from "../humanize";

export const headingAdapter: ComponentAdapter = {
  type: "heading",
  async verify(node: A2UINode, container: Locator, _page: Page, walkChildren: WalkChildren) {
    const text = visibleString(node.text ?? node.label);
    if (text) {
      const heading = container.getByRole("heading", { name: text });
      if ((await heading.count()) > 0) {
        await expect(heading.first()).toBeVisible();
      } else {
        await expect(container.getByText(text, { exact: false }).first()).toBeVisible();
      }
    }
    await walkChildren(node.children, container);
  },
};

export const textAdapter: ComponentAdapter = {
  type: "text",
  async verify(node: A2UINode, container: Locator, _page: Page, walkChildren: WalkChildren) {
    const text = visibleString(node.text ?? node.attributes.contentText);
    if (text) {
      const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean);
      if (firstLine) {
        await expect(container.getByText(firstLine, { exact: false }).first()).toBeVisible();
      }
    }
    await walkChildren(node.children, container);
  },
};

/** Visual spacer in the schema — no DOM contract. */
export const dividerAdapter: ComponentAdapter = {
  type: "divider",
  async verify(_node: A2UINode, _container: Locator, _page: Page, _walkChildren: WalkChildren) {
    return;
  },
};
