import type { Locator, Page } from "@playwright/test";
import type { A2UINode, ComponentAdapter, WalkChildren } from "../types";

/**
 * List — unpack nested `items` (already flattened onto `node.children` by the parser) and walk.
 */
export const listAdapter: ComponentAdapter = {
  type: "list",
  async verify(node: A2UINode, container: Locator, _page: Page, walkChildren: WalkChildren) {
    await walkChildren(node.children, container);
  },
};
