import fs from "fs";
import path from "path";
import { Given, When, Then } from "../../api-fixtures";
import { compareFactFind } from "../../../factfind/src/a2ui-engine/agents/complaints-workflow/complaints-rules";
import {
  compareStoredFactFind,
  loadAgentOutputFile,
  loadAggregatedPayload,
} from "../../../factfind/src/a2ui-engine/agents/complaints-workflow/compare-factfind-files";

function loadComplaintRefs(): string[] {
  const configuredPath =
    process.env.COMPLAINT_REFS_FILE || "factfind/data/complaint-references.json";
  const fullPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Complaint reference file not found: ${fullPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as Record<string, unknown>;
  const fromList = Array.isArray(parsed.complaintRefs) ? parsed.complaintRefs.map(String) : [];
  const fromGroups = Object.values(parsed)
    .filter(Array.isArray)
    .flatMap((items) => items)
    .filter((item) => typeof item === "string")
    .map(String);
  return [...new Set(fromList.length > 0 ? fromList : fromGroups)];
}

When("aggregated payload and agent output are loaded for {string}", async function (complaintRef: string) {
  this.store = this.store || {};
  this.store.aggregated = loadAggregatedPayload(complaintRef);
  this.store.adk = loadAgentOutputFile(complaintRef);
});

Then("fact find in agent output should match the aggregated payload", async function () {
  compareFactFind(this.store.aggregated, this.store.adk);
});

Given("fact-find compare loads complaint references from the catalog", async function () {
  this.store = this.store || {};
  this.store.allComplaintRefs = loadComplaintRefs();
});

Then(
  "fact find in agent output should match aggregated payload for every loaded reference",
  async function () {
    const refs: string[] = this.store?.allComplaintRefs?.length
      ? this.store.allComplaintRefs
      : loadComplaintRefs();
    if (refs.length === 0) {
      throw new Error("No complaint references loaded");
    }
    const failures: string[] = [];
    for (const complaintRef of refs) {
      try {
        compareStoredFactFind(complaintRef);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${complaintRef}: ${message}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Fact-find mismatch for ${failures.length} of ${refs.length} refs:\n\n${failures.join("\n\n")}`,
      );
    }
  },
);
