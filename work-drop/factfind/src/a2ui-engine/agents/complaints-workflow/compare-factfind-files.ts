import fs from "fs";
import path from "path";
import { compareFactFind } from "./complaints-rules";

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function firstExisting(candidates: string[]): string | undefined {
  return candidates.find((file) => fs.existsSync(file));
}

export function loadAggregatedPayload(complaintRef: string): unknown {
  const filePath = firstExisting([
    path.join(process.cwd(), "factfind", "aggregated-payloads", `${complaintRef}.json`),
    path.join(process.cwd(), "fixtures", `${complaintRef}.json`),
  ]);
  if (!filePath) {
    throw new Error(`Aggregated payload not found for ${complaintRef}`);
  }
  return readJson(filePath);
}

export function loadAgentOutputFile(complaintRef: string): unknown {
  const filePath = firstExisting([
    path.join(process.cwd(), "factfind", "ai-evals", "outputs", `adk_${complaintRef}.json`),
    path.join(process.cwd(), "factfind", "aggregated-agent-response", `${complaintRef}.json`),
    path.join(process.cwd(), "factfind", "aggregated-agent-response", `adk_${complaintRef}.json`),
    path.join(process.cwd(), "fixtures", `adk_${complaintRef}.json`),
  ]);
  if (!filePath) {
    throw new Error(`Agent output file not found for ${complaintRef}`);
  }
  return readJson(filePath);
}

export function compareStoredFactFind(complaintRef: string): void {
  compareFactFind(loadAggregatedPayload(complaintRef), loadAgentOutputFile(complaintRef));
}
