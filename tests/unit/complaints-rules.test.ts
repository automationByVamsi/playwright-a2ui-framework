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
  });

  it("takes the first 14 digits of an account number", () => {
    expect(first14("LTPB Current 77110364287668")).toBe("77110364287668");
    expect(first14("LTPB Current (77110364287668)")).toBe("77110364287668");
    expect(first14("7711036429136000000")).toBe("77110364291360");
  });

  it("prefers final_agent_response over agentOutput when both exist", () => {
    const adk = load("adk_NC10010449_dev.json");
    const ui = readFactFindUi(adk);
    expect(ui.fact_find).toBeTruthy();
    expect(ui.groundednessCheck).toBeUndefined();
  });

  it.each([
    ["adk_NC10010449.json", "Aug capture"],
    ["adk_NC10010449_int_existing.json", "INT generated"],
    ["adk_NC10010449_dev.json", "DEV generated"],
    ["adk_new.json", "DEV Bruno event array"],
  ])("passes %s (%s)", (file) => {
    const adk = load(file);
    const facts = extractFromAgentOutput(adk);
    expect(facts.partyIds).toEqual(["1420289780", "46142591"]);
    expect(facts.customers["46142591"].relatedAccounts).toContain("77110364287668");
    expect(() => compareFactFind(aggregated, adk)).not.toThrow();
  });

  it("fails with a clear message when ADK drops Frederick", () => {
    const trace = load("adk_NC10010449_dev.json");
    const inner = JSON.parse(trace.agentOutput);
    inner.fact_find.customers = [inner.fact_find.customers[0]];
    const mutated = { ...trace, agentOutput: JSON.stringify(inner), raw_events: [] };
    expect(() => compareFactFind(aggregated, mutated)).toThrow(/1420289780/);
  });
});
