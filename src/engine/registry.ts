import type { ComponentAdapter } from "./types.js";
import { accordionAdapter } from "./adapters/accordion.js";
import { gridAdapter } from "./adapters/grid.js";
import { summaryBoxAdapter } from "./adapters/summarybox.js";
import { blockAdapter } from "./adapters/block.js";
import { listAdapter } from "./adapters/list.js";
import { dividerAdapter, headingAdapter, textAdapter } from "./adapters/passthrough.js";

const adapters = new Map<string, ComponentAdapter>();

function register(adapter: ComponentAdapter): void {
  adapters.set(adapter.type.toLowerCase(), adapter);
}

register(accordionAdapter);
register(gridAdapter);
register(summaryBoxAdapter);
register(blockAdapter);
register(listAdapter);
register(headingAdapter);
register(textAdapter);
register(dividerAdapter);

/** Alias used in ADK traces (`summaryBox` vs `summarybox`). */
adapters.set("summarybox", summaryBoxAdapter);

/**
 * Register another catalog type without changing the walker:
 *
 *   registerAdapter({
 *     type: "timeline",
 *     async verify(node, container, page, walkChildren) { ... },
 *   });
 */
export function registerAdapter(adapter: ComponentAdapter): void {
  register(adapter);
}

export function getAdapter(type: string): ComponentAdapter | undefined {
  return adapters.get(type.toLowerCase());
}

export function registeredTypes(): string[] {
  return [...adapters.keys()].sort();
}
