import assert from "node:assert/strict";
import { parseAdkContract } from "../../core/parser/adk-contract-parser";

/**
 * Complaints Workflow business rules. Plain assertions — if this fails, read the message
 * and open the two JSON files. This is not the A2UI walker.
 */
function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** First 14 digits — how this agent identifies an account. */
export function first14(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 14);
}

function sourcePartyIds(aggregated: unknown): string[] {
  const root = rec(aggregated);
  const derived = rec(root.derived);
  const fromDerived = [...arr(derived.customerFlowPartyIds), ...arr(derived.resolvedPartyIds)]
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (fromDerived.length > 0) return [...new Set(fromDerived)];
  return arr(rec(rec(root.sources).ica).customers)
    .map((c) => String(rec(c).customerOCISID ?? "").trim())
    .filter(Boolean);
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  const obj = rec(node);
  if (Object.keys(obj).length === 0) return;
  visit(obj);
  walk(obj.content, visit);
  walk(obj.items, visit);
  walk(obj.sections, visit);
  walk(obj.customers, visit);
  walk(obj.children, visit);
}

function adkPartyIds(trace: unknown): string[] {
  const ids: string[] = [];
  walk(parseAdkContract(trace).raw.fact_find, (obj) => {
    if (obj.party_id != null) ids.push(String(obj.party_id).trim());
  });
  return [...new Set(ids)];
}

function sourceRelatedAccounts(aggregated: unknown): string[] {
  const items = arr(rec(rec(rec(aggregated).sources).ica).items);
  return [
    ...new Set(
      items
        .map((item) => first14(rec(item).accountNumberFull ?? rec(item).accountNumber))
        .filter((n) => n.length > 0),
    ),
  ];
}

/** Account numbers sitting under a "Related to complaint" heading in agentOutput. */
function adkRelatedAccounts(trace: unknown): string[] {
  const found: string[] = [];
  let related = false;
  walk(parseAdkContract(trace).raw.fact_find, (obj) => {
    const type = String(obj.type ?? "").toLowerCase();
    if (type === "heading") {
      const text = String(obj.text ?? "").toLowerCase();
      if (text.includes("unrelated")) related = false;
      else if (text.includes("related to complaint")) related = true;
    }
    if (related && type === "accordion" && obj.label) {
      const account = first14(obj.label);
      if (account.length >= 8) found.push(account);
    }
  });
  return [...new Set(found)];
}

export function assertComplaintsRules(aggregated: unknown, trace: unknown): void {
  const sourceIds = sourcePartyIds(aggregated);
  const adkIds = adkPartyIds(trace);
  assert.deepEqual(
    [...adkIds].sort(),
    [...sourceIds].sort(),
    `ADK dropped or added a source customer.\n  source: ${sourceIds.join(", ")}\n  adk:    ${adkIds.join(", ")}`,
  );

  const sourceRelated = sourceRelatedAccounts(aggregated);
  const adkRelated = adkRelatedAccounts(trace);
  for (const account of sourceRelated) {
    assert.ok(
      adkRelated.includes(account),
      `ICA complaint account ${account} is not under "Related to complaint" in agentOutput.\n  ADK related: ${adkRelated.join(", ") || "(none)"}`,
    );
  }

  const groundedness = rec(parseAdkContract(trace).raw.groundednessCheck);
  const status = String(groundedness.status ?? "").toLowerCase();
  assert.equal(status, "correct", `groundednessCheck.status should be "correct" (was "${status || "empty"}")`);
  const message = String(groundedness.message ?? "");
  assert.ok(
    /pass/i.test(message) || /✅/.test(message),
    `groundednessCheck.message should look like a pass:\n  ${message || "(empty)"}`,
  );
}
