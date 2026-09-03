import type { Locator, Page } from "@playwright/test";
import type { UIComponent } from "../core/models/ui-component.js";

export type A2UINode = UIComponent;

export type WalkChildren = (children: A2UINode[], scope: Locator) => Promise<void>;

/**
 * One adapter per A2UI `type` (case-insensitive).
 *
 * To add a catalog type (e.g. `timeline`, `data-table`):
 * 1. Create `src/engine/adapters/<type>.ts` implementing this interface.
 * 2. Register it in `src/engine/registry.ts`.
 * 3. Keep locators semantic (role / label / accessible name). Do not use hashed CSS.
 */
export interface ComponentAdapter {
  readonly type: string;
  verify(
    node: A2UINode,
    container: Locator,
    page: Page,
    walkChildren: WalkChildren,
  ): Promise<void>;
}
