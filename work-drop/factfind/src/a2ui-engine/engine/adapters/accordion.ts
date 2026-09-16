import { expect, type Locator, type Page } from "@playwright/test";
import type { A2UINode, ComponentAdapter, WalkChildren } from "../types";
import { escapeRegExp } from "../humanize";

async function detailsForLabel(container: Locator, name: RegExp): Promise<Locator | undefined> {
  const candidates = container.locator("details");
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const item = candidates.nth(i);
    const summary = item.locator(":scope > summary");
    if ((await summary.count()) === 0) continue;
    const text = (await summary.innerText()).trim();
    if (name.test(text)) return item;
  }
  return undefined;
}

/**
 * Accordion — toggle by accessible name, expand if collapsed, then walk `content`.
 * Hive: `button[aria-expanded]`. Stub: `<details>/<summary>` (summary is not always role=button).
 * Direct-child summary match avoids nested accordions stealing the outer scope.
 */
export const accordionAdapter: ComponentAdapter = {
  type: "accordion",
  async verify(node: A2UINode, container: Locator, _page: Page, walkChildren: WalkChildren) {
    const label = node.label?.trim();
    if (!label) {
      await walkChildren(node.children, container);
      return;
    }

    const name = new RegExp(escapeRegExp(label), "i");
    const details = await detailsForLabel(container, name);
    const toggle = details
      ? details.locator(":scope > summary")
      : container.getByRole("button", { name }).or(container.locator("summary").filter({ hasText: name })).first();

    await expect(toggle, `accordion "${label}" should be visible`).toBeVisible();

    const expanded = await toggle.getAttribute("aria-expanded");
    if (expanded === "false") {
      await toggle.click();
    } else if (details && (await details.getAttribute("open")) === null) {
      await toggle.click();
    }

    const childScope = details ?? container;
    await walkChildren(node.children, childScope);
  },
};
