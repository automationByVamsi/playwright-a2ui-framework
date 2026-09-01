import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Ground truth from source systems — not a UI stub.
 * Work-repo path: factfind/aggregated-payloads/${complaintRef}.json
 */
export function loadAggregatedPayload(complaintRef: string): unknown {
  const file = path.resolve(process.cwd(), "factfind", "aggregated-payloads", `${complaintRef}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

/**
 * ADK UI contract — not a UI stub.
 * Default: factfind/ai-evals/outputs/adk_${complaintRef}.json
 * Override with ADK_OUTPUT_DIR (work repo sometimes uses factfind/aggregated-agent-response).
 */
export function loadAgentOutputTrace(complaintRef: string): unknown {
  const dir = process.env.ADK_OUTPUT_DIR ?? path.join("factfind", "ai-evals", "outputs");
  const file = path.resolve(process.cwd(), dir, `adk_${complaintRef}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}
