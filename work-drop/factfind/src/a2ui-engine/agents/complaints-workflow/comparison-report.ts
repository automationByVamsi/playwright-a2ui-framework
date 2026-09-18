import type { CollectionResult, CompareResult, FieldResult } from "./compare-map";

/**
 * A second view of one CompareResult: compare-map.ts judges each row, this
 * classifies the judgements for whoever reads the run — the BDD report on disk
 * and the review dashboard.
 *
 * `passed` deliberately matches what compareFactFind throws on, so a run can
 * never report as passed while the assertion fails, or the reverse.
 */

export type FindingStatus =
  | "VALUE MISMATCH"
  | "MISSING FIELD"
  | "EXTRA FIELD"
  | "MISSING ITEM"
  | "EXTRA ITEM"
  | "MISSING SECTION"
  | "NOT ASSESSABLE";

/** Everything except NOT ASSESSABLE, which is worth reporting but not failing on. */
const blocking: ReadonlySet<FindingStatus> = new Set<FindingStatus>([
  "VALUE MISMATCH",
  "MISSING FIELD",
  "EXTRA FIELD",
  "MISSING ITEM",
  "EXTRA ITEM",
  "MISSING SECTION",
]);

export type ComparisonFinding = {
  /** "complaint", "customers", "customer_profile", or a collection name. */
  section: string;
  partyId: string;
  /** Which row of a collection, e.g. an account number. Empty for customer fields. */
  itemKey: string;
  field: string;
  status: FindingStatus;
  sourceValue: string;
  agentValue: string;
  explanation: string;
};

export type ComparisonReport = {
  complaintRef: string;
  passed: boolean;
  /** Every row the map judged, whether or not it could be asserted. */
  fieldsChecked: number;
  summary: Record<FindingStatus, number>;
  findings: ComparisonFinding[];
};

const explanations: Record<FindingStatus, (field: string) => string> = {
  "VALUE MISMATCH": (field) => `${field} differs between the payload and the screen.`,
  "MISSING FIELD": (field) => `The screen omits ${field}.`,
  "EXTRA FIELD": (field) => `The screen shows ${field}, which the payload does not have.`,
  "MISSING ITEM": (field) => `${field} is in the payload but not on the screen.`,
  "EXTRA ITEM": (field) => `${field} is on the screen but not in the payload.`,
  "MISSING SECTION": (field) => `The screen never renders the ${field} section.`,
  "NOT ASSESSABLE": (field) => `${field} was not asserted: one side is silent about it.`,
};

function statusOf(field: FieldResult): FindingStatus | null {
  if (field.verdict === "ok") return null;
  if (field.verdict === "skip") return "NOT ASSESSABLE";
  if (!field.ui.length) return "MISSING FIELD";
  if (!field.source.length) return "EXTRA FIELD";
  return "VALUE MISMATCH";
}

const show = (values: string[]): string => values.join(", ");

const emptySummary = (): Record<FindingStatus, number> => ({
  "VALUE MISMATCH": 0,
  "MISSING FIELD": 0,
  "EXTRA FIELD": 0,
  "MISSING ITEM": 0,
  "EXTRA ITEM": 0,
  "MISSING SECTION": 0,
  "NOT ASSESSABLE": 0,
});

export function reportOf(result: CompareResult): ComparisonReport {
  const findings: ComparisonFinding[] = [];
  let fieldsChecked = 0;

  function add(
    finding: Omit<ComparisonFinding, "explanation"> & { explanation?: string },
  ): void {
    findings.push({ ...finding, explanation: explanations[finding.status](finding.field) });
  }

  function judge(section: string, partyId: string, itemKey: string, field: FieldResult): void {
    fieldsChecked += 1;
    const status = statusOf(field);
    if (!status) return;
    add({
      section,
      partyId,
      itemKey,
      field: field.field,
      status,
      sourceValue: show(field.source),
      agentValue: show(field.ui),
    });
  }

  function judgeCollection(partyId: string, collection: CollectionResult): void {
    if (!collection.sectionPresent) {
      add({
        section: collection.name,
        partyId,
        itemKey: "",
        field: collection.name,
        status: "MISSING SECTION",
        sourceValue: show(collection.sourceIds),
        agentValue: "",
      });
      return;
    }
    for (const id of collection.missingIds) {
      add({
        section: collection.name,
        partyId,
        itemKey: id,
        field: id,
        status: "MISSING ITEM",
        sourceValue: id,
        agentValue: "",
      });
    }
    for (const id of collection.extraIds) {
      add({
        section: collection.name,
        partyId,
        itemKey: id,
        field: id,
        status: "EXTRA ITEM",
        sourceValue: "",
        agentValue: id,
      });
    }
    for (const row of collection.rows) {
      for (const field of row.fields) {
        judge(collection.name, partyId, row.id || row.key, field);
      }
    }
  }

  for (const field of result.root) judge("complaint", "", "", field);

  for (const partyId of result.sourcePartyIds) {
    if (result.uiPartyIds.includes(partyId)) continue;
    add({
      section: "customers",
      partyId,
      itemKey: partyId,
      field: partyId,
      status: "MISSING ITEM",
      sourceValue: partyId,
      agentValue: "",
    });
  }
  for (const partyId of result.uiPartyIds) {
    if (result.sourcePartyIds.includes(partyId)) continue;
    add({
      section: "customers",
      partyId,
      itemKey: partyId,
      field: partyId,
      status: "EXTRA ITEM",
      sourceValue: "",
      agentValue: partyId,
    });
  }

  for (const customer of result.customers) {
    // An absent customer is already reported against the customers section.
    if (!customer.present) continue;
    for (const field of customer.fields) judge("customer_profile", customer.partyId, "", field);
    for (const collection of customer.collections) judgeCollection(customer.partyId, collection);
  }

  const summary = emptySummary();
  for (const finding of findings) summary[finding.status] += 1;

  return {
    complaintRef: result.root.find((field) => field.field === "complaintRef")?.source[0] ?? "",
    passed: findings.every((finding) => !blocking.has(finding.status)),
    fieldsChecked,
    summary,
    findings,
  };
}
