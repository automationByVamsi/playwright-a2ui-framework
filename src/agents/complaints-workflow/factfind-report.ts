import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { arr, getDetailsFromJson, rec, str, uniqueSorted, type UiLocator } from "./json-get.js";
import { factFindMap, type FieldRule, type SourceSpec } from "./factfind-map.js";
import { failuresOf, readSourceView, readUiView, runCompare } from "./compare-map.js";
import { reportOf } from "./comparison-report.js";
import { extractFromAggregated, extractFromAgentOutput } from "./complaints-rules.js";

/**
 * JSON reporting for the review dashboard. Read-only: it runs the same map, the
 * same getter and the same matchers the assertion uses, and prints the verdicts.
 *
 *   npx tsx src/agents/complaints-workflow/factfind-report.ts all
 *   npx tsx src/agents/complaints-workflow/factfind-report.ts report <aggregated> <adk>
 *   npx tsx src/agents/complaints-workflow/factfind-report.ts locate <file> '<locator json>'
 */

function load(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function describeSource(spec: SourceSpec): string {
  if (typeof spec === "string") return spec;
  const paths = spec.firstOf
    ? `first of: ${spec.firstOf.join(" | ")}`
    : (spec.paths ?? []).join(" + ");
  return spec.transform ? `${paths}  →  ${spec.transform}()` : paths;
}

export function describeLocator(locator: UiLocator): string {
  const steps: string[] = [];
  if (locator.accordion) steps.push(`accordion "${locator.accordion}"`);
  if (locator.list) steps.push("list rows");
  if (locator.accounts) {
    steps.push(locator.accounts === true ? "account accordions" : `${locator.accounts} accounts`);
  }
  if (locator.label) steps.push(`block "${locator.label}"`);
  if (locator.keys) steps.push(`keys /${locator.keys.source}/`);
  if (locator.key) steps.push(`key ${locator.key}`);
  if (locator.empty) steps.push(`empty when /${locator.empty.source}/`);
  return steps.join("  →  ") || "(row itself)";
}

function describeRule(rule: FieldRule, scope: string): Record<string, unknown> {
  return {
    scope,
    field: rule.field,
    match: rule.match,
    optional: Boolean(rule.optional),
    source: describeSource(rule.source),
    ui: describeLocator(rule.ui.at),
    uiTransform: rule.ui.transform ?? "",
  };
}

/** The contract as flat rows, for the dashboard's map view. */
export function describeMap(): Record<string, unknown>[] {
  const rows = factFindMap.fields.map((rule) => describeRule(rule, "customer"));
  for (const collection of factFindMap.collections) {
    rows.push({ ...describeRule(collection.id, collection.name), field: `${collection.id.field} (id)` });
    for (const rule of collection.fields) rows.push(describeRule(rule, collection.name));
  }
  return rows;
}

/** Which part of the trace supplied fact_find. Mirrors readFactFindUi's order. */
function uiOrigin(adk: unknown): string {
  const events = Array.isArray(adk) ? adk : arr(rec(adk).raw_events);
  for (const event of events) {
    const final = rec(rec(rec(rec(event).actions).stateDelta).final_agent_response);
    if (final.fact_find) return `final_agent_response (author: ${str(rec(event).author) || "unknown"})`;
  }
  return typeof rec(adk).agentOutput === "string" ? "agentOutput string" : "fact_find root";
}

export function buildReport(aggregatedFile: string, adkFile: string): Record<string, unknown> {
  const aggregated = load(aggregatedFile);
  const adk = load(adkFile);
  const source = readSourceView(aggregated, factFindMap);
  const ui = readUiView(adk, factFindMap);
  const compare = runCompare(source, ui, factFindMap);
  const failures = failuresOf(compare);

  return {
    aggregatedFile: path.basename(aggregatedFile),
    adkFile: path.basename(adkFile),
    complaintRef: str(rec(aggregated).complaintRef) || path.basename(aggregatedFile, ".json"),
    generatedAt: str(rec(aggregated).generatedAt),
    capturedAt: str(rec(adk).capturedAt),
    uiOrigin: uiOrigin(adk),
    ok: failures.length === 0,
    failures,
    report: reportOf(compare),
    compare,
    views: { source, ui },
    facts: { source: extractFromAggregated(aggregated), ui: extractFromAgentOutput(adk) },
  };
}

type Pair = { aggregated: string; adk: string };

/** Pairs fixtures by complaintRef, falling back to whichever payload holds the same parties. */
export function discoverPairs(dir: string): Pair[] {
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  const aggregated: { file: string; ref: string; partyIds: string[] }[] = [];
  const traces: { file: string; ref: string }[] = [];

  for (const file of files) {
    const full = path.join(dir, file);
    let payload: unknown;
    try {
      payload = load(full);
    } catch {
      continue;
    }
    const root = rec(payload);
    const ref = str(root.complaintRef);
    if (!Array.isArray(payload) && root.sources) {
      aggregated.push({
        file: full,
        ref,
        partyIds: uniqueSorted(readSourceView(payload, factFindMap).partyIds),
      });
      continue;
    }
    if (Array.isArray(payload) || root.raw_events || root.agentOutput || root.fact_find) {
      traces.push({ file: full, ref });
    }
  }

  const pairs: Pair[] = [];
  for (const trace of traces) {
    let owner = aggregated.find((row) => row.ref && row.ref === trace.ref);
    if (!owner) {
      let partyIds: string[] = [];
      try {
        partyIds = readUiView(load(trace.file), factFindMap).partyIds;
      } catch {
        partyIds = [];
      }
      owner = aggregated.find(
        (row) => partyIds.length > 0 && partyIds.every((id) => row.partyIds.includes(id)),
      );
    }
    if (owner) pairs.push({ aggregated: owner.file, adk: trace.file });
  }
  return pairs.sort((left, right) => (left.aggregated + left.adk).localeCompare(right.aggregated + right.adk));
}

function parseLocator(raw: string): UiLocator {
  const input = rec(JSON.parse(raw) as unknown);
  const locator: UiLocator = {};
  if (input.accordion) locator.accordion = str(input.accordion);
  if (input.label) locator.label = str(input.label);
  if (input.key) locator.key = str(input.key);
  if (input.keys) locator.keys = new RegExp(str(input.keys), "i");
  if (input.empty) locator.empty = new RegExp(str(input.empty), "i");
  if (input.list) locator.list = true;
  if (input.accounts) locator.accounts = input.accounts === true ? true : (str(input.accounts) as "related");
  return locator;
}

function main(argv: string[]): void {
  const [command, ...args] = argv;
  const fixtures = process.env.FACTFIND_FIXTURES ?? "fixtures";

  if (command === "map") {
    process.stdout.write(JSON.stringify(describeMap(), null, 2));
    return;
  }

  if (command === "all") {
    const reports = discoverPairs(fixtures).map((pair) => {
      try {
        return buildReport(pair.aggregated, pair.adk);
      } catch (error) {
        return {
          aggregatedFile: path.basename(pair.aggregated),
          adkFile: path.basename(pair.adk),
          complaintRef: path.basename(pair.aggregated, ".json"),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          failures: [],
        };
      }
    });
    process.stdout.write(JSON.stringify({ map: describeMap(), reports }, null, 2));
    return;
  }

  if (command === "report" && args.length === 2) {
    process.stdout.write(JSON.stringify(buildReport(args[0] as string, args[1] as string), null, 2));
    return;
  }

  if (command === "locate" && args.length === 2) {
    const payload = load(args[0] as string);
    const locator = parseLocator(args[1] as string);
    const ui = rec(payload).fact_find ? payload : readUiViewRoot(payload);
    process.stdout.write(
      JSON.stringify(
        {
          locator: describeLocator(locator),
          customers: arr(getDetailsFromJson(ui, factFindMap.ui.customers)).map((customer) => ({
            partyId: str(getDetailsFromJson(customer, factFindMap.ui.partyId)),
            found: getDetailsFromJson(customer, locator) ?? null,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  throw new Error(`Usage: factfind-report.ts all | map | report <aggregated> <adk> | locate <adk> '<locator>'`);
}

/** locate works on a raw trace as well as on an already-unwrapped UI object. */
function readUiViewRoot(payload: unknown): unknown {
  const events = Array.isArray(payload) ? payload : arr(rec(payload).raw_events);
  for (const event of events) {
    const final = rec(rec(rec(rec(event).actions).stateDelta).final_agent_response);
    if (final.fact_find) return final;
  }
  const root = rec(payload);
  if (typeof root.agentOutput === "string") return JSON.parse(root.agentOutput) as unknown;
  return payload;
}

main(process.argv.slice(2));
