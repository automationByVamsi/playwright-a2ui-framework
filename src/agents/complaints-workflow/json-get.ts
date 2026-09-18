/**
 * The one JSON getter. It is deliberately dumb: it returns what the locator asks
 * for and nothing else. It never guesses a field, never walks both trees looking
 * for pairs, and never falls back to an unscoped key search.
 *
 * Two locator kinds:
 *   "party.address.postcode"                        dotted path on aggregated JSON
 *   { accordion: "Personal details", key: "age" }   label-scoped lookup on the A2UI tree
 */

export type UiLocator = {
  /** Scope to the first accordion whose label contains this text (case-insensitive). */
  accordion?: string;
  /** Scope to the first node whose label contains this text (case-insensitive). */
  label?: string;
  /** Return one entry per list row (items[*]) inside the scope. */
  list?: boolean;
  /** Return the nested account accordions inside the scope, optionally by relatedness. */
  accounts?: boolean | "related" | "unrelated";
  /** First value found under the scope for this key. */
  key?: string;
  /** Every value under the scope whose key matches, in document order. */
  keys?: RegExp;
  /** A text under the scope matching this means "nothing to show here" -> []. */
  empty?: RegExp;
};

export type Locator = string | UiLocator;

/** Child keys the A2UI contract nests under. Nothing else is descended into. */
const CONTAINERS = ["content", "items", "sections", "customers", "children"] as const;

export function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function lower(value: unknown): string {
  return str(value).toLowerCase();
}

/** Lower-cased, punctuation-free form used for all text comparisons. */
export function collapse(value: unknown): string {
  return lower(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

/** Account numbers are quoted at different lengths; the first 14 digits are the identity. */
export function first14(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 14);
}

export function isEmptyValue(value: unknown): boolean {
  if (value == null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

/** Substitutes the current scope id, e.g. "...customerHoldingsByParty.{id}.party". */
export function withId(path: string, id: string): string {
  return path.replace(/\{id\}/g, id);
}

function visit(node: unknown, seen: (obj: Record<string, unknown>) => boolean): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => visit(child, seen));
  }
  const obj = rec(node);
  if (Object.keys(obj).length === 0) return false;
  if (seen(obj)) return true;
  return CONTAINERS.some((key) => key in obj && visit(obj[key], seen));
}

function findNode(scope: unknown, match: (obj: Record<string, unknown>) => boolean): unknown {
  let found: unknown;
  visit(scope, (obj) => {
    if (!match(obj)) return false;
    found = obj;
    return true;
  });
  return found;
}

function labelHolds(obj: Record<string, unknown>, text: string): boolean {
  return collapse(obj.label).includes(collapse(text));
}

function accountNodes(scope: unknown, want: boolean | "related" | "unrelated"): unknown[] {
  const accounts: unknown[] = [];
  let related = false;
  visit(scope, (obj) => {
    if (lower(obj.type) === "heading") {
      const text = lower(obj.text);
      if (text.includes("unrelated")) related = false;
      else if (text.includes("related") && text.includes("complaint")) related = true;
    }
    const isAccount = lower(obj.type) === "accordion" && first14(obj.label).length === 14;
    if (!isAccount) return false;
    if (want === true || (want === "related") === related) accounts.push(obj);
    return false;
  });
  return accounts;
}

function listRows(scope: unknown): unknown[] {
  const rows: unknown[] = [];
  visit(scope, (obj) => {
    if (lower(obj.type) !== "list") return false;
    for (const row of arr(obj.items)) rows.push(Array.isArray(row) ? row : [row]);
    return false;
  });
  return rows;
}

function readKey(scope: unknown, key: string): unknown {
  let value: unknown;
  visit(scope, (obj) => {
    if (!(key in obj) || obj[key] == null) return false;
    value = obj[key];
    return true;
  });
  return value;
}

function readKeys(scope: unknown, keys: RegExp): unknown[] {
  const values: unknown[] = [];
  visit(scope, (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (keys.test(key) && value != null) values.push(value);
    }
    return false;
  });
  return values;
}

function hasText(scope: unknown, pattern: RegExp): boolean {
  let hit = false;
  visit(scope, (obj) => {
    if (!pattern.test(str(obj.text))) return false;
    hit = true;
    return true;
  });
  return hit;
}

/** label / key / keys, applied to one node (a scope or a single list row). */
function readPart(node: unknown, locator: UiLocator): unknown {
  let scope = node;
  if (locator.label != null) {
    scope = findNode(scope, (obj) => labelHolds(obj, locator.label as string));
    if (scope === undefined) return undefined;
  }
  if (locator.keys) return readKeys(scope, locator.keys);
  if (locator.key != null) return readKey(scope, locator.key);
  return scope;
}

function readTokens(node: unknown, tokens: string[]): unknown {
  let value: unknown = node;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (value == null) return undefined;
    if (token === "*") {
      const rest = tokens.slice(index + 1);
      const items = arr(value);
      return rest.length === 0 ? items : items.map((item) => readTokens(item, rest));
    }
    if (Array.isArray(value)) {
      const position = Number(token);
      value = Number.isInteger(position) ? value[position] : undefined;
      continue;
    }
    if (typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[token];
  }
  return value;
}

/** Reads one locator. Returns the node, a list of nodes, or undefined. */
export function getDetailsFromJson(payload: unknown, locator: Locator): unknown {
  if (typeof locator === "string") {
    return readTokens(payload, locator.replace(/\[(\*|\d+)\]/g, ".$1").split("."));
  }

  const scope =
    locator.accordion == null
      ? payload
      : findNode(
          payload,
          (obj) => lower(obj.type) === "accordion" && labelHolds(obj, locator.accordion as string),
        );
  if (scope === undefined) return undefined;
  if (locator.empty && hasText(scope, locator.empty)) return [];

  const rows = locator.list ? listRows(scope) : locator.accounts ? accountNodes(scope, locator.accounts) : null;
  if (rows === null) return readPart(scope, locator);
  if (locator.label == null && locator.key == null && !locator.keys) return rows;
  return rows.map((row) => readPart(row, locator));
}

/** The UI object holding fact_find. final_agent_response wins over agentOutput. */
export function readFactFindUi(adk: unknown): Record<string, unknown> {
  const events = Array.isArray(adk) ? adk : arr(rec(adk).raw_events);
  for (const event of events) {
    const final = rec(rec(rec(rec(event).actions).stateDelta).final_agent_response);
    if (final.fact_find) return final;
  }

  const root = rec(adk);
  if (typeof root.agentOutput === "string") {
    try {
      const ui = rec(JSON.parse(root.agentOutput) as unknown);
      if (ui.fact_find) return ui;
    } catch {
      /* fall through to the error below */
    }
  }
  if (root.fact_find) return root;

  throw new Error(
    "No fact_find UI. Looked for final_agent_response, then agentOutput. Tool calls are ignored.",
  );
}
