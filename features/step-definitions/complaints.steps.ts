import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { primaryClassification } from "../../src/core/classification/failure-classifier.js";
import type { ValidationWorld } from "../support/world.js";

Given("the complaint reference {string}", async function (this: ValidationWorld, ref: string) {
  this.complaintRef = ref;
});

Given(
  "the ADK contract is mutated to drop customer {string}",
  async function (this: ValidationWorld, partyId: string) {
    this.mutation = { dropCustomerPartyId: partyId };
  },
);

Given("the rendered UI hides customer {string}", async function (this: ValidationWorld, partyId: string) {
  this.dropRenderedPartyId = partyId;
});

When("the Complaints Workflow contract is validated", async function (this: ValidationWorld) {
  this.result = this.service.run(this.buildContext());
});

When("the Complaints Workflow is executed in the UI", async function (this: ValidationWorld) {
  if (!this.page) {
    throw new Error("Browser page is not available. Tag the scenario with @browser.");
  }
  this.result = await this.service.runWithRender(this.buildContext(), this.page);
});

Then("validation should pass", async function (this: ValidationWorld) {
  assert.ok(this.result, "no validation result");
  assert.equal(this.result.overall, "PASS", JSON.stringify(this.result.diffs.concat(this.result.missing), null, 2));
});

Then("validation should fail", async function (this: ValidationWorld) {
  assert.ok(this.result, "no validation result");
  assert.equal(this.result.overall, "FAIL");
});

Then("the contract should contain {int} customer profiles", async function (this: ValidationWorld, count: number) {
  assert.ok(this.result, "no validation result");
  assert.equal(this.result.counts.customers?.actual, count);
  assert.equal(this.result.counts.customers?.expected, count);
});

Then("each customer's personal details should match the source data", async function (this: ValidationWorld) {
  assert.ok(this.result, "no validation result");
  const personal = this.result.diffs.filter((d) =>
    ["name", "dateOfBirth", "age", "maritalStatus", "address"].includes(d.field),
  );
  assert.equal(personal.length, 0, JSON.stringify(personal, null, 2));
});

Then("the groundedness check should be {string}", async function (this: ValidationWorld, status: string) {
  assert.ok(this.result, "no validation result");
  assert.equal(this.result.groundedness.value, status);
  assert.equal(this.result.groundedness.status, "PASS");
});

Then("the failure class should be {string}", async function (this: ValidationWorld, expected: string) {
  assert.ok(this.result, "no validation result");
  const actual = primaryClassification([
    ...this.result.diffs,
    ...this.result.missing,
    ...this.result.duplicates,
  ]);
  assert.equal(actual, expected);
});

Then("the missing customer should be named {string}", async function (this: ValidationWorld, name: string) {
  assert.ok(this.result, "no validation result");
  const hit = this.result.missing.find((m) => String(m.message).includes(name) || String(m.expected).includes(name));
  assert.ok(hit, `Expected missing customer ${name}, got ${JSON.stringify(this.result.missing)}`);
});

Then("the missing party id should be {string}", async function (this: ValidationWorld, partyId: string) {
  assert.ok(this.result, "no validation result");
  const hit = [...this.result.missing, ...this.result.diffs].some(
    (m) => m.entityId === partyId || String(m.message).includes(partyId),
  );
  assert.ok(hit, `Expected partyId ${partyId} in missing/diffs`);
});

Then("the contract path should include {string}", async function (this: ValidationWorld, fragment: string) {
  assert.ok(this.result, "no validation result");
  const hit = [...this.result.missing, ...this.result.diffs].some((m) => (m.contractPath ?? "").includes(fragment));
  assert.ok(hit, `Expected contract path to include ${fragment}`);
});

Then("the rendered UI should contain {int} customer profiles", async function (this: ValidationWorld, count: number) {
  assert.ok(this.result, "no validation result");
  assert.equal(this.result.counts.renderedCustomers?.actual, count);
  assert.equal(this.result.counts.renderedCustomers?.expected, count);
});

Then("the rendered UI layer should be {string}", async function (this: ValidationWorld, status: string) {
  assert.ok(this.result, "no validation result");
  assert.equal(this.result.layers.renderedUi.status, status);
});

Then("the rendered path should be {string}", async function (this: ValidationWorld, expected: string) {
  assert.ok(this.result, "no validation result");
  const hit = this.result.missing.some((m) => m.renderedPath === expected);
  assert.ok(hit, `Expected rendered path ${expected}`);
});
