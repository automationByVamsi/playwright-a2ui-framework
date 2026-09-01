import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redactPii } from "../evidence/redaction.js";
import { primaryClassification } from "../classification/failure-classifier.js";
import type { ValidationResult } from "../models/validation-result.js";

export function writeDomainReport(result: ValidationResult, reportDir: string): { jsonPath: string; mdPath: string } {
  mkdirSync(reportDir, { recursive: true });
  const safeRef = result.complaintRef || "unknown";
  const jsonPath = path.join(reportDir, `${safeRef}-${result.scenario}-validation.json`);
  const mdPath = path.join(reportDir, `${safeRef}-${result.scenario}-validation.md`);

  const redacted = redactPii(result) as ValidationResult;
  writeFileSync(jsonPath, JSON.stringify(redacted, null, 2), "utf8");
  writeFileSync(mdPath, renderMarkdown(result), "utf8");
  return { jsonPath, mdPath };
}

export function renderMarkdown(result: ValidationResult): string {
  const classification = primaryClassification([...result.diffs, ...result.missing, ...result.duplicates]);
  const missingCustomers = result.missing.filter((d) => d.entityType === "customer");

  const lines: string[] = [
    "------------------------------------------------",
    "AI UI VALIDATION REPORT",
    "------------------------------------------------",
    "",
    `Agent: ${result.agent}`,
    `Scenario: ${result.scenario}`,
    `Complaint: ${result.complaintRef}`,
    "",
    `Overall: ${result.overall}`,
    `Gating: ${result.gating}`,
    "",
    `Ground Truth: ${result.layers.groundTruth.status}`,
    `ADK UI Contract: ${result.layers.adkContract.status}`,
    `Rendered UI: ${result.layers.renderedUi.status}${result.layers.renderedUi.reason ? ` (${result.layers.renderedUi.reason})` : ""}`,
    `Semantic: ${result.layers.semantic.status}`,
    "",
    `Failure classification: ${classification ?? "n/a"}`,
    `Groundedness: ${result.groundedness.status} (${result.groundedness.value ?? ""})`,
    "",
    "------------------------------------------------",
    "COUNTS",
    "------------------------------------------------",
    "",
  ];

  for (const [key, value] of Object.entries(result.counts)) {
    lines.push(`${key}: expected ${value.expected}, actual ${value.actual}`);
  }

  lines.push("", "------------------------------------------------", "ENTITIES", "------------------------------------------------", "");
  for (const entity of result.entities) {
    lines.push(`- [${entity.status}] ${entity.type} ${entity.displayName ?? ""} (${entity.id})`);
    if (entity.paths?.contract) lines.push(`    contract: ${entity.paths.contract}`);
    if (entity.paths?.groundTruth) lines.push(`    ground truth: ${entity.paths.groundTruth}`);
    if (entity.paths?.rendered) lines.push(`    rendered: ${entity.paths.rendered}`);
  }

  if (missingCustomers.length > 0 || result.missing.length > 0) {
    lines.push("", "------------------------------------------------", "MISSING", "------------------------------------------------", "");
    for (const m of result.missing) {
      lines.push(`- ${m.message}`);
      lines.push(`    expected: ${stringify(m.expected)}`);
      lines.push(`    actual: ${stringify(m.actual)}`);
      if (m.groundTruthPath) lines.push(`    ground truth: ${m.groundTruthPath}`);
      if (m.contractPath) lines.push(`    ADK path: ${m.contractPath}`);
      if (m.renderedPath) lines.push(`    rendered: ${m.renderedPath}`);
    }
  }

  if (result.duplicates.length > 0) {
    lines.push("", "------------------------------------------------", "DUPLICATES", "------------------------------------------------", "");
    for (const d of result.duplicates) lines.push(`- ${d.message}`);
  }

  if (result.diffs.length > 0) {
    lines.push("", "------------------------------------------------", "DIFFS", "------------------------------------------------", "");
    for (const d of result.diffs) {
      lines.push(`- [${d.classification}] ${d.message}`);
      lines.push(`    field: ${d.field}`);
      lines.push(`    expected: ${stringify(d.expected)}`);
      lines.push(`    actual: ${stringify(d.actual)}`);
      lines.push(`    rule: ${d.rule}`);
      if (d.contractPath) lines.push(`    ADK path: ${d.contractPath}`);
      if (d.groundTruthPath) lines.push(`    ground truth: ${d.groundTruthPath}`);
    }
  }

  lines.push(
    "",
    "------------------------------------------------",
    "EVIDENCE",
    "------------------------------------------------",
    "",
    `Screenshot: ${result.evidence.screenshot ?? "n/a"}`,
    `Playwright trace: ${result.evidence.trace ?? "n/a"}`,
    `Report JSON: ${result.evidence.reportPath ?? "n/a"}`,
    "",
  );

  return lines.join("\n");
}

function stringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
