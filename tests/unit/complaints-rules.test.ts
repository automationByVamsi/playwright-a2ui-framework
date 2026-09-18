import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareFactFind,
  extractFromAggregated,
  extractFromAgentOutput,
  first14,
  readFactFindUi,
} from "../../src/agents/complaints-workflow/complaints-rules.js";

function load(name: string) {
  return JSON.parse(readFileSync(path.resolve("fixtures", name), "utf8"));
}

describe("fact-find extract + compare", () => {
  const aggregated = load("NC10010449.json");

  it("extracts both customers from holdings, not ICA first names", () => {
    const facts = extractFromAggregated(aggregated);
    expect(facts.partyIds).toEqual(["1420289780", "46142591"]);
    expect(facts.customers["46142591"].firstName).toBe("Alexandra");
    expect(facts.customers["1420289780"].lastName).toBe("Hussain");
    expect(facts.customers["46142591"].relatedAccounts).toEqual(["77110364287668"]);
    expect(facts.customers["46142591"].unrelatedAccounts).toContain("77110364291360");
    expect(facts.customers["46142591"].supportNeeds).toEqual([]);
    expect(facts.customers["46142591"].relatedParties).toEqual([]);
    expect(facts.customers["46142591"].contactNotes).toEqual([]);
  });

  it("extracts structured support needs, related parties and contact notes", () => {
    const facts = extractFromAggregated(load("NC10010556.json"));
    const customer = facts.customers["68905187"];
    expect(facts.partyIds).toEqual(["68905187"]);
    expect(customer.relatedAccounts).toEqual(["77110361403060"]);
    expect(customer.supportNeeds.map((need) => need.description)).toEqual([
      "3P - 3rd Party Mandate",
      "DO NOT USE - Need for Quiet",
      "Adapt - Longer Appointment",
      "Domestic/Financial Abuse",
      "Life Event - Flexibility",
    ]);
    expect(customer.relatedParties).toEqual([
      expect.objectContaining({
        relatedPartyId: "158010138",
        relationship: "Attorney / Receiver to",
        relationshipCode: "007",
        name: "Mr M Kerch",
        partyType: "INDIVIDUAL",
      }),
    ]);
    expect(customer.contactNotes).toHaveLength(5);
    expect(customer.contactNotes[0]).toEqual(
      expect.objectContaining({
        classification: "Complaints and Disputes",
        outcome: "From 3rd Party",
        method: "In Person",
        brand: "Lloyds Bank plc",
      }),
    );
  });

  it("takes the first 14 digits of an account number", () => {
    expect(first14("LTPB Current 77110364287668")).toBe("77110364287668");
    expect(first14("LTPB Current (77110364287668)")).toBe("77110364287668");
    expect(first14("7711036429136000000")).toBe("77110364291360");
  });

  it("prefers final_agent_response over agentOutput when both exist", () => {
    const adk = load("adk_NC10010449.json");
    expect(typeof adk.agentOutput).toBe("string");
    const ui = readFactFindUi(adk);
    expect(ui.fact_find).toBeTruthy();
    expect(ui.groundednessCheck).toBeUndefined();
  });

  it("passes NC10010449 with both customers", () => {
    const adk = load("adk_NC10010449.json");
    const facts = extractFromAgentOutput(adk);
    expect(facts.partyIds).toEqual(["1420289780", "46142591"]);
    expect(facts.customers["46142591"].relatedAccounts).toContain("77110364287668");
    expect(() => compareFactFind(aggregated, adk)).not.toThrow();
  });

  it("passes NC10010556 structured fact find", () => {
    expect(() => compareFactFind(load("NC10010556.json"), load("adk_NC10010556.json"))).not.toThrow();
  });

  it("fails with a clear message when ADK drops Frederick", () => {
    const trace = load("adk_NC10010449.json");
    const inner = JSON.parse(trace.agentOutput);
    inner.fact_find.customers = [inner.fact_find.customers[0]];
    const mutated = { ...trace, agentOutput: JSON.stringify(inner), raw_events: [] };
    expect(() => compareFactFind(aggregated, mutated)).toThrow(/1420289780/);
  });
});
