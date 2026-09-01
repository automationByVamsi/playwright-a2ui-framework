import { DataTable } from "playwright-bdd";
import { Given, When, Then } from "../ui-fixtures.js";
import { loadAggregatedPayload, loadAgentOutputTrace } from "../../../factfind/src/utils/payload-loader.js";
import { A2UIComponentValidator } from "../../../factfind/src/utils/a2ui-component-validator.js";
import { ValidationAssert } from "../../../factfind/src/utils/validation-assert.js";

let aggregatedPayload: unknown;
let agentOutputTrace: unknown;

Given("user navigates to the Complaints Workflow", async function () {
  await this.complaintsWorkflowPage.openWorkflow();
});

Given("the rendered UI hides customer party id {string}", async function (partyId: string) {
  this.complaintsWorkflowPage.dropRenderedPartyId = partyId;
});

When("user searches for complaint reference {string} in complaints workflow", async function (complaintRef: string) {
  this.complaintRef = complaintRef;
  aggregatedPayload = loadAggregatedPayload(complaintRef);
  agentOutputTrace = loadAgentOutputTrace(complaintRef);
  this.aggregatedPayload = aggregatedPayload;
  this.agentOutputTrace = agentOutputTrace;
  await this.complaintsWorkflowPage.searchComplaint(complaintRef);
});

When("complaints agent output is displayed", async function () {
  await this.complaintsWorkflowPage.waitForLoader();
  await this.agentOutputPage.waitForGeneratedResponse();
  await this.complaintsWorkflowPage.waitForCustomerTabs();
});

Then("complaint reference should be displayed correctly in complaints workflow", async function () {
  await this.agentOutputPage.assertComplaintReference(this.complaintRef);
});

Then("the complaints workflow A2UI rendered UI should match the agent contract:", async function (table: DataTable) {
  this.lastValidationResult = await runA2ui(this, table);
  ValidationAssert.scenario(this.lastValidationResult);
});

Then("the complaints workflow A2UI rendered UI should match the agent contract", async function () {
  const validator = new A2UIComponentValidator(this.page, this.complaintsWorkflowPage);
  this.lastValidationResult = await validator.validateRenderedUI(aggregatedPayload, agentOutputTrace, {
    complaintRef: this.complaintRef,
    assert: false,
  });
  ValidationAssert.scenario(this.lastValidationResult);
});

Then("the complaints workflow A2UI rendered UI is compared to the agent contract:", async function (table: DataTable) {
  this.lastValidationResult = await runA2ui(this, table);
});

Then("the A2UI validation should fail with class {string}", async function (failureClass: string) {
  const result = this.lastValidationResult;
  if (!result) {
    throw new Error("A2UI validation has not run yet");
  }
  const actual =
    result.layers.renderedUi.status === "FAIL"
      ? result.layers.renderedUi.reason
      : result.layers.adkContract.reason;
  ValidationAssert.equal("failure class", failureClass, actual);
  if (result.overall !== "FAIL") {
    throw new Error(`Expected overall FAIL, actual ${result.overall}`);
  }
});

async function runA2ui(world: {
  page: import("@playwright/test").Page;
  complaintsWorkflowPage: import("../../../pages/factfind/complaints-workflow.page.js").ComplaintsWorkflowPage;
  complaintRef: string;
}, table: DataTable) {
  const targetSections = table
    .hashes()
    .map((row) => row.section)
    .filter((section): section is string => Boolean(section));
  const validator = new A2UIComponentValidator(world.page, world.complaintsWorkflowPage);
  return validator.validateRenderedUI(aggregatedPayload, agentOutputTrace, {
    targetSections,
    complaintRef: world.complaintRef,
    assert: false,
  });
}
