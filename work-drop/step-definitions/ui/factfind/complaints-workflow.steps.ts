import { DataTable } from "playwright-bdd";
import { Given, When, Then } from "../ui-fixtures";
import { resolveFactFind } from "../../../factfind/src/utils/payload-loader";
import { stubComplaintsAgentRun } from "../../../factfind/src/utils/agent-stub";
import { assertComplaintsRules } from "../../../factfind/src/a2ui-engine/agents/complaints-workflow/complaints-rules";
import { verifyTraceOnPage } from "../../../factfind/src/a2ui-engine/engine/verify-trace";
import type { TraceRoot } from "../../../factfind/src/a2ui-engine/engine/verify-trace";

let aggregatedPayload: any;
let agentOutputTrace: any;

Given("user navigates to the Complaints Workflow", async function () {
  await this.complaintsWorkflowPage.openWorkflow();
});

When("user searches for complaint reference {string} in complaints workflow", async function (ref: string) {
  const pair = resolveFactFind(ref);
  aggregatedPayload = pair.source;
  agentOutputTrace = pair.adk;

  // CI default: replay the captured adk_*.json trace. Only @live scenarios hit the real agent.
  const isLive = this.testInfo.tags.includes("@live") ?? false;
  if (!isLive) {
    await stubComplaintsAgentRun(this.page, agentOutputTrace);
  }

  await this.complaintsWorkflowPage.searchComplaint(ref);
});

When("complaints agent output is displayed", async function () {
  await this.complaintsWorkflowPage.waitForLoader();
  await this.agentOutputPage.waitForGeneratedResponse(aggregatedPayload?.complaintRef);
});

Then("complaint reference should be displayed correctly in complaints workflow", async function () {
  await this.agentOutputPage.assertComplaintReference(aggregatedPayload.complaintRef);
});

Then("the groundedness banner should show {string} in complaints workflow", async function (expected: string) {
  const banner = expected.trim().toLowerCase() === "needs verifying" ? "needsVerifying" : "passedGroundedness";
  await this.complaintsWorkflowPage.assertGroundednessBanner(banner);
});

Then("the complaint summary should be displayed in complaints workflow", async function () {
  await this.complaintsWorkflowPage.assertComplaintSummaryVisible();
});

When("user clicks Show more in complaints workflow", async function () {
  await this.complaintsWorkflowPage.clickShowMore();
});

When("aggregated payload and ADK trace are loaded for {string}", async function (ref: string) {
  const pair = resolveFactFind(ref);
  aggregatedPayload = pair.source;
  agentOutputTrace = pair.adk;
});

Then("the complaints workflow fact find should match the aggregated payload", async function () {
  assertComplaintsRules(aggregatedPayload, agentOutputTrace);
});

Then("the complaints workflow A2UI rendered UI should match the agent contract:", async function (table: DataTable) {
  const sections = table
    .hashes()
    .map((row) => row.section)
    .filter((section): section is string => Boolean(section));

  const roots: TraceRoot[] = [];
  if (sections.some((s) => /fact_find|customerProfile|all/i.test(s))) roots.push("fact_find");
  if (sections.some((s) => /summary/i.test(s))) roots.push("summaryBox");
  if (sections.some((s) => /analysis/i.test(s))) roots.push("analysis");

  // Swap for a tighter Hive locator (e.g. this.complaintsWorkflowPage.factFindRoot) when you have one.
  const container = this.page.getByRole("main").or(this.page.locator("body"));

  await verifyTraceOnPage(this.page, agentOutputTrace, container, roots.length > 0 ? roots : undefined);
});
