import {
  arr,
  collapse,
  first14,
  getDetailsFromJson,
  isEmptyValue,
  lower,
  readFactFindUi,
  rec,
  str,
  uniqueSorted,
  withId,
} from "./json-get";
import type {
  CollectionRule,
  FactFindMap,
  FieldRule,
  MatchName,
  RootRule,
  ScopeSpec,
  SourceSpec,
  TransformName,
  UiSpec,
} from "./factfind-map";

/**
 * Runner for factfind-map.ts. Reads both sides through getDetailsFromJson into
 * the same shape, then dispatches every row on its match type. No field names
 * live here.
 */

export type ItemView = { id: string; key: string; fields: Record<string, string[]> };

export type CustomerView = {
  partyId: string;
  fields: Record<string, string[]>;
  collections: Record<string, ItemView[]>;
  /** Whether the trace rendered each accordion at all. Always true on the source side. */
  sections: Record<string, boolean>;
};

export type SideView = {
  /** Values read from the file root, outside any customer. */
  root: Record<string, string[]>;
  partyIds: string[];
  customers: Record<string, CustomerView>;
};

/* ---------- value normalising ---------- */

function flat(values: unknown[]): unknown[] {
  return values.flat(3);
}

/** Every resolved value as trimmed text. Absent and blank values drop out. */
function texts(values: unknown[]): string[] {
  return flat(values).map(str).filter(Boolean);
}

export function toIsoDate(value: unknown): string {
  const raw = str(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  return raw;
}

export function toIsoDateTime(value: unknown): string {
  const raw = str(value)
    .replace(/^last changed:\s*/i, "")
    .replace(/^ongoing.*$/i, "");
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? "00"}:${iso[5] ?? "00"}:${iso[6] ?? "00"}`;
  }
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (uk) {
    const time = `${(uk[4] ?? "00").padStart(2, "0")}:${uk[5] ?? "00"}:${uk[6] ?? "00"}`;
    return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}T${time}`;
  }
  return toIsoDate(raw);
}

export function money(value: unknown): string {
  if (value == null || value === "") return "";
  const numeric = str(value).replace(/[£GBP,\s]/gi, "");
  const parsed = Number(numeric);
  return Number.isNaN(parsed) ? str(value) : parsed.toFixed(2);
}

function hasClock(value: unknown): boolean {
  return /\d{1,2}:\d{2}/.test(str(value));
}

function parseTenure(value: string): { years: number; months: number } | null {
  const text = lower(value);
  if (!/\d/.test(text)) return null;
  return {
    years: Number(text.match(/(\d+)\s*years?/)?.[1] ?? 0),
    months: Number(text.match(/(\d+)\s*months?/)?.[1] ?? 0),
  };
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
}

/* ---------- named transforms ---------- */

/** Each transform receives one entry per configured path, in map order. */
const transforms: Record<TransformName, (perPath: unknown[]) => unknown> = {
  first14: (perPath) => flat(perPath).map(first14),

  accountNumbers: (perPath) =>
    uniqueSorted(flat(perPath).map(first14)).filter((number) => number.length === 14),

  /** Holdings that are not the complaint's accounts. Paths are [every holding, ICA]. */
  unrelatedAccountNumbers: (perPath) => {
    const complaint = new Set(flat([perPath[1]]).map(first14));
    return uniqueSorted(flat([perPath[0]]).map(first14)).filter(
      (number) => number.length === 14 && !complaint.has(number),
    );
  },

  count: (perPath) => {
    const rows = arr(perPath[0]).length;
    return rows > 0 ? String(rows) : "";
  },

  join: (perPath) => texts(perPath).join(" "),

  indicatorsOrNone: (perPath) => {
    const raw = perPath[0];
    if (raw == null) return "none";
    if (Array.isArray(raw)) {
      const labels = uniqueSorted(
        raw.map((row) => str(typeof row === "string" ? row : rec(row).description ?? rec(row).code)),
      );
      return labels.length > 0 ? labels.join(", ") : "none";
    }
    return str(raw) || "none";
  },

  reviewOrOngoing: (perPath) => (isEmptyValue(perPath[0]) ? "ongoing" : str(perPath[0])),

  /** The notification reads "<relationship> <name>"; drop the relationship to get the name. */
  relatedPartyName: (perPath) => {
    const [notifications, relationship, ...fallbacks] = perPath;
    const prefix = str(relationship);
    for (const text of texts([notifications])) {
      if (!prefix || lower(text).startsWith(lower(prefix))) return str(text.slice(prefix.length));
    }
    return texts(fallbacks)[0] ?? "";
  },

  stripSupportNeedPrefix: (perPath) =>
    flat(perPath).map((value) => str(value).replace(/^support need:\s*/i, "")),

  /** CURRENT_ACCOUNT reads as "current account", however the screen cases it. */
  words: (perPath) => flat(perPath).map((value) => str(value).replace(/_/g, " ")),
};

/* ---------- matchers ---------- */

/** "skip" means nothing could be asserted, so it is never a failure. */
export type Verdict = "ok" | "fail" | "skip";

const verdict = (ok: boolean): Verdict => (ok ? "ok" : "fail");

/** An absent source value is never a failure: the source is what we assert about. */
const matchers: Record<MatchName, (source: string[], ui: string[]) => Verdict> = {
  equal: (source, ui) =>
    !source.length ? "skip" : verdict(collapse(source[0]) === collapse(ui[0] ?? "")),

  date: (source, ui) => {
    const expected = source[0] ?? "";
    const actual = ui[0] ?? "";
    if (!expected) return "skip";
    if (!actual) return "fail";
    if (/ongoing/i.test(expected) || /ongoing/i.test(actual)) {
      return verdict(/ongoing/i.test(expected) && /ongoing/i.test(actual));
    }
    if (toIsoDateTime(expected) === toIsoDateTime(actual)) return "ok";
    // One side quoted a date only; compare the day.
    if (!hasClock(expected) || !hasClock(actual)) {
      return verdict(toIsoDate(expected) === toIsoDate(actual));
    }
    return "fail";
  },

  /** Skipped when either side omits the amount: older traces drop balance rows. */
  money: (source, ui) =>
    !source.length || !ui.length ? "skip" : verdict(money(source[0]) === money(ui[0])),

  contains: (source, ui) => {
    if (!source.length) return "skip";
    const shown = collapse(ui.join(" "));
    return verdict(source.every((part) => shown.includes(collapse(part))));
  },

  tenure: (source, ui) => {
    const expected = source[0] ?? "";
    const actual = ui[0] ?? "";
    if (!expected) return "skip";
    if (!actual) return "fail";
    if (collapse(expected) === collapse(actual)) return "ok";
    const from = parseTenure(expected);
    const to = parseTenure(actual);
    if (!from || !to) return verdict(collapse(actual).includes(collapse(expected)));
    return verdict(Math.abs((from.years * 12 + from.months) - (to.years * 12 + to.months)) <= 1);
  },

  /** A set row states the whole list, so "none on either side" is the only skip. */
  set: (source, ui) =>
    !source.length && !ui.length ? "skip" : verdict(sameSet(source, ui)),

  /** A true/false source against however the screen words it. */
  boolean: (source, ui) => {
    const expected = source[0] ?? "";
    const actual = ui[0] ?? "";
    if (!expected) return "skip";
    if (!actual) return "fail";
    const yes = (value: string) => /^(true|yes|y|1)$/.test(collapse(value));
    const no = (value: string) => /^(false|no|n|0)$/.test(collapse(value));
    if (yes(expected)) return verdict(yes(actual));
    if (no(expected)) return verdict(no(actual));
    return verdict(collapse(expected) === collapse(actual));
  },
};

/** Collection rows pair on this key, so it must normalise the same way the matcher does. */
function idKey(match: MatchName, id: string): string {
  return match === "date" ? toIsoDateTime(id) : collapse(id);
}

/* ---------- reading each side ---------- */

function sourceValues(scope: unknown, spec: SourceSpec, id: string): string[] {
  const rule = typeof spec === "string" ? { paths: [spec] } : spec;
  const paths = (rule.paths ?? rule.firstOf ?? []).map((path) => withId(path, id));
  const perPath = paths.map((path) => getDetailsFromJson(scope, path));
  const chosen = rule.firstOf ? [perPath.find((value) => !isEmptyValue(value))] : perPath;
  return texts(rule.transform ? [transforms[rule.transform](chosen)] : chosen);
}

function uiValues(node: unknown, spec: UiSpec): string[] {
  const found = getDetailsFromJson(node, spec.at);
  return texts([spec.transform ? transforms[spec.transform]([found]) : found]);
}

function customerScope(
  aggregated: unknown,
  config: Record<string, ScopeSpec>,
  partyId: string,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(config)) {
    const found = spec.firstOf
      .map((path) => getDetailsFromJson(aggregated, withId(path, partyId)))
      .find((value) => !isEmptyValue(value));
    scope[key] =
      spec.whereId && Array.isArray(found)
        ? found.filter((row) => str(rec(row)[spec.whereId as string]) === partyId)
        : found;
  }
  return scope;
}

function sourceItems(scope: unknown, collection: CollectionRule): ItemView[] {
  const injected = Object.entries(collection.source.with ?? {});
  return arr(getDetailsFromJson(scope, collection.source.path)).map((row) => {
    const item: Record<string, unknown> = { ...rec(row) };
    for (const [key, path] of injected) item[key] = getDetailsFromJson(scope, path);
    const id = sourceValues(item, collection.id.source, "")[0] ?? "";
    const fields: Record<string, string[]> = {};
    for (const rule of collection.fields) fields[rule.field] = sourceValues(item, rule.source, id);
    return { id, key: idKey(collection.id.match, id), fields };
  });
}

/** `present` is false only when the accordion is absent, not when it says "none recorded". */
function uiItems(
  node: unknown,
  collection: CollectionRule,
): { present: boolean; items: ItemView[] } {
  const found = getDetailsFromJson(node, collection.ui.at);
  const items = arr(found).map((row) => {
    const id = uiValues(row, collection.id.ui)[0] ?? "";
    const fields: Record<string, string[]> = {};
    for (const rule of collection.fields) fields[rule.field] = uiValues(row, rule.ui);
    return { id, key: idKey(collection.id.match, id), fields };
  });
  return { present: found !== undefined, items };
}

function rootValues(file: unknown, rules: RootRule[], side: "source" | "ui"): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const rule of rules) values[rule.field] = sourceValues(file, rule[side], "");
  return values;
}

export function readSourceView(aggregated: unknown, map: FactFindMap): SideView {
  const partyIds = uniqueSorted(sourceValues(aggregated, map.source.partyIds, ""));
  const customers: Record<string, CustomerView> = {};
  for (const partyId of partyIds) {
    const scope = customerScope(aggregated, map.source.customer, partyId);
    const fields: Record<string, string[]> = {};
    for (const rule of map.fields) fields[rule.field] = sourceValues(scope, rule.source, partyId);
    const collections: Record<string, ItemView[]> = {};
    const sections: Record<string, boolean> = {};
    for (const collection of map.collections) {
      collections[collection.name] = sourceItems(scope, collection);
      sections[collection.name] = true;
    }
    customers[partyId] = { partyId, fields, collections, sections };
  }
  return { root: rootValues(aggregated, map.root, "source"), partyIds, customers };
}

export function readUiView(adk: unknown, map: FactFindMap): SideView {
  const ui = readFactFindUi(adk);
  const customers: Record<string, CustomerView> = {};
  for (const node of arr(getDetailsFromJson(ui, map.ui.customers))) {
    const partyId = str(getDetailsFromJson(node, map.ui.partyId));
    if (!partyId) continue;
    const fields: Record<string, string[]> = {};
    for (const rule of map.fields) fields[rule.field] = uiValues(node, rule.ui);
    const collections: Record<string, ItemView[]> = {};
    const sections: Record<string, boolean> = {};
    for (const collection of map.collections) {
      const { present, items } = uiItems(node, collection);
      collections[collection.name] = items;
      sections[collection.name] = present;
    }
    customers[partyId] = { partyId, fields, collections, sections };
  }
  // Root values live on the trace envelope, not inside the fact_find tree.
  return {
    root: rootValues(adk, map.root, "ui"),
    partyIds: uniqueSorted(Object.keys(customers)),
    customers,
  };
}

/* ---------- comparing ---------- */

/** One judged row. `skipped` means nothing could be asserted, so it counts as neither. */
export type FieldResult = {
  field: string;
  match: MatchName;
  source: string[];
  ui: string[];
  verdict: Verdict;
  ok: boolean;
  skipped: boolean;
};

export type RowResult = { id: string; key: string; fields: FieldResult[] };

export type CollectionResult = {
  name: string;
  /** False when the trace never rendered the accordion. */
  sectionPresent: boolean;
  idsMatch: boolean;
  sourceIds: string[];
  uiIds: string[];
  /** Rows on one side only. Paired by normalised key, reported by readable id. */
  missingIds: string[];
  extraIds: string[];
  rows: RowResult[];
};

export type CustomerResult = {
  partyId: string;
  present: boolean;
  fields: FieldResult[];
  collections: CollectionResult[];
};

export type CompareResult = {
  root: FieldResult[];
  partyIdsMatch: boolean;
  sourcePartyIds: string[];
  uiPartyIds: string[];
  customers: CustomerResult[];
};

function quote(values: string[]): string {
  return values.join(", ") || "(empty)";
}

function judge(
  rule: { field: string; match: MatchName; optional?: boolean },
  source: string[],
  ui: string[],
): FieldResult {
  const outcome: Verdict =
    rule.optional && ui.length === 0 ? "skip" : matchers[rule.match](source, ui);
  return {
    field: rule.field,
    match: rule.match,
    source,
    ui,
    verdict: outcome,
    ok: outcome !== "fail",
    skipped: outcome === "skip",
  };
}

function judgeCollection(
  collection: CollectionRule,
  source: ItemView[],
  ui: ItemView[],
  sectionPresent: boolean,
): CollectionResult {
  const sourceKeys = new Set(source.map((item) => item.key));
  const uiKeys = new Set(ui.map((item) => item.key));
  const missingIds = source.filter((item) => !uiKeys.has(item.key)).map((item) => item.id);
  const extraIds = ui.filter((item) => !sourceKeys.has(item.key)).map((item) => item.id);
  const idsMatch = missingIds.length === 0 && extraIds.length === 0;
  const rows: RowResult[] = [];
  if (idsMatch) {
    for (const item of source) {
      const match = ui.find((row) => row.key === item.key);
      if (!match) continue;
      rows.push({
        id: item.id,
        key: item.key,
        fields: collection.fields.map((rule) =>
          judge(rule, item.fields[rule.field] ?? [], match.fields[rule.field] ?? []),
        ),
      });
    }
  }
  return {
    name: collection.name,
    sectionPresent,
    idsMatch,
    sourceIds: source.map((item) => item.id),
    uiIds: ui.map((item) => item.id),
    missingIds,
    extraIds,
    rows,
  };
}

/**
 * Judges every row of the map. failuresOf turns this into assertion messages and
 * comparison-report.ts into findings; neither judges anything itself.
 */
export function runCompare(source: SideView, ui: SideView, map: FactFindMap): CompareResult {
  return {
    root: map.root.map((rule) =>
      judge(rule, source.root[rule.field] ?? [], ui.root[rule.field] ?? []),
    ),
    partyIdsMatch: sameSet(source.partyIds, ui.partyIds),
    sourcePartyIds: source.partyIds,
    uiPartyIds: ui.partyIds,
    customers: source.partyIds
      .filter((partyId) => source.customers[partyId])
      .map((partyId) => {
        const expected = source.customers[partyId] as CustomerView;
        const actual = ui.customers[partyId];
        if (!actual) return { partyId, present: false, fields: [], collections: [] };
        return {
          partyId,
          present: true,
          fields: map.fields.map((rule) =>
            judge(rule, expected.fields[rule.field] ?? [], actual.fields[rule.field] ?? []),
          ),
          collections: map.collections.map((collection) =>
            judgeCollection(
              collection,
              expected.collections[collection.name] ?? [],
              actual.collections[collection.name] ?? [],
              actual.sections[collection.name] ?? false,
            ),
          ),
        };
      }),
  };
}

export function failuresOf(result: CompareResult): string[] {
  const failures: string[] = [];

  for (const field of result.root) {
    if (field.ok) continue;
    failures.push(
      `${field.field} does not match: source "${quote(field.source)}" adk "${quote(field.ui)}" — are these the same complaint?`,
    );
  }

  if (!result.partyIdsMatch) {
    failures.push(
      `partyIds do not match.\n  source: ${quote(result.sourcePartyIds)}\n  adk:    ${quote(result.uiPartyIds)}`,
    );
  }

  for (const customer of result.customers) {
    const prefix = `party ${customer.partyId}`;
    if (!customer.present) {
      failures.push(`${prefix}: missing from fact_find`);
      continue;
    }
    for (const field of customer.fields) {
      if (field.ok) continue;
      failures.push(`${prefix} ${field.field}: source "${quote(field.source)}" adk "${quote(field.ui)}"`);
    }
    for (const collection of customer.collections) {
      if (!collection.sectionPresent) {
        // "No support needs recorded" is a statement; an absent accordion is a gap.
        failures.push(`${prefix} ${collection.name}: section missing from fact_find`);
        continue;
      }
      if (!collection.idsMatch) {
        const detail = [
          collection.missingIds.length ? `not on screen [${collection.missingIds.join("; ")}]` : "",
          collection.extraIds.length ? `only on screen [${collection.extraIds.join("; ")}]` : "",
        ]
          .filter(Boolean)
          .join(", ");
        failures.push(`${prefix} ${collection.name}: ${detail}`);
        continue;
      }
      for (const row of collection.rows) {
        const rowPrefix = `${prefix} ${collection.name} "${row.id || row.key}"`;
        for (const field of row.fields) {
          if (field.ok) continue;
          failures.push(`${rowPrefix} ${field.field}: source "${quote(field.source)}" adk "${quote(field.ui)}"`);
        }
      }
    }
  }

  return failures;
}
