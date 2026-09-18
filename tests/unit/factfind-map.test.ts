import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareFactFind } from "../../src/agents/complaints-workflow/complaints-rules.js";
import { factFindMap } from "../../src/agents/complaints-workflow/factfind-map.js";
import {
  failuresOf,
  readSourceView,
  readUiView,
  runCompare,
} from "../../src/agents/complaints-workflow/compare-map.js";

function load(name: string) {
  return JSON.parse(readFileSync(`fixtures/${name}`, "utf8"));
}

function factFindOf(trace: {
  raw_events: Array<{ actions?: { stateDelta?: { final_agent_response?: { fact_find?: unknown } } } }>;
}) {
  const event = trace.raw_events.find((row) => row.actions?.stateDelta?.final_agent_response?.fact_find);
  return (event as { actions: { stateDelta: { final_agent_response: { fact_find: any } } } }).actions
    .stateDelta.final_agent_response.fact_find;
}

describe("fact find map", () => {
  it("resolves every row on both sides of NC10010556", () => {
    const source = readSourceView(load("NC10010556.json"), factFindMap);
    const ui = readUiView(load("adk_NC10010556.json"), factFindMap);
    const customer = source.customers["68905187"];
    const shown = ui.customers["68905187"];
    // This customer holds only the complaint account, so both sides are rightly empty.
    const emptyForThisRef = new Set(["unrelatedAccounts"]);
    // In the contract but not on screen yet. Asserted absent so that the day the
    // agent renders one, this fails and its provisional row gets confirmed.
    const notRendered = new Set(["gender", "dateOfDeath", "supportRequired", "productType", "productGroup", "closed"]);

    for (const rule of factFindMap.fields) {
      if (emptyForThisRef.has(rule.field)) continue;
      if (notRendered.has(rule.field)) {
        expect(shown.fields[rule.field], `adk ${rule.field}`).toEqual([]);
        continue;
      }
      expect(customer.fields[rule.field], `source ${rule.field}`).not.toEqual([]);
      expect(shown.fields[rule.field], `adk ${rule.field}`).not.toEqual([]);
    }

    for (const collection of factFindMap.collections) {
      const rows = customer.collections[collection.name];
      const uiRows = shown.collections[collection.name];
      expect(rows.length, collection.name).toBe(uiRows.length);
      for (const row of rows) {
        const paired = uiRows.find((candidate) => candidate.key === row.key);
        expect(paired, `${collection.name} ${row.id}`).toBeTruthy();
        for (const rule of collection.fields) {
          if (notRendered.has(rule.field)) {
            expect(paired?.fields[rule.field], `adk ${collection.name}.${rule.field}`).toEqual([]);
            continue;
          }
          expect(row.fields[rule.field], `source ${collection.name}.${rule.field}`).not.toEqual([]);
          expect(paired?.fields[rule.field], `adk ${collection.name}.${rule.field}`).not.toEqual([]);
        }
      }
    }
  });

  // A locator that silently resolves to nothing would still pass the fixtures,
  // so each family of rules is proved to fail on a changed UI.
  it.each([
    ["name", (ff: any) => { ff.customers[0].sections[0].content[0].name = "Mr Wrong Person"; }, /name: source/],
    ["dateOfBirth", (ff: any) => { ff.customers[0].sections[0].content[0].date_of_birth = "19/08/1991"; }, /dateOfBirth/],
    ["address", (ff: any) => { ff.customers[0].sections[0].content[2].text = "1 Other Street,\nZZ1 1ZZ"; }, /address:/],
    ["timeWithBank", (ff: any) => { ff.customers[0].sections[0].content[4].time_with_bank = "2 years, 1 month"; }, /timeWithBank/],
    ["relatedAccounts", (ff: any) => { ff.customers[0].sections[1].content[0].text = "Unrelated to the complaint"; }, /relatedAccounts/],
    ["account balance", (ff: any) => { ff.customers[0].sections[1].content[1].items[0][0].content[0].current_balance = "£ 12.34"; }, /currentBalance/],
    ["account number", (ff: any) => { ff.customers[0].sections[1].content[1].items[0][0].label = "Classic (77110361403061)"; }, /accounts:/],
    ["support need identity", (ff: any) => { ff.customers[0].sections[3].content[0].items[0][0].heading = "Support need: Other"; }, /supportNeeds:/],
    ["support need field", (ff: any) => { ff.customers[0].sections[3].content[0].items[0][1].consent_status = "Withdrawn"; }, /consentStatus/],
    ["support needs dropped", (ff: any) => { ff.customers[0].sections[3].content = [{ type: "text", text: "No support needs recorded." }]; }, /supportNeeds:/],
    ["related party", (ff: any) => { ff.customers[0].sections[2].content[1].items[0][0].name = "Mrs Someone Else"; }, /relatedParties .* name/],
    ["contact note identity", (ff: any) => { ff.customers[0].sections[5].content[0].items[0][0].text = "01/01/2020 09:00:00"; }, /contactNotes:/],
    ["contact note field", (ff: any) => { ff.customers[0].sections[5].content[0].items[0][2].brand = "Halifax"; }, /brand/],
    ["contact notes dropped", (ff: any) => { ff.customers[0].sections[5].content = [{ type: "text", text: "No contact notes." }]; }, /contactNotes:/],
  ])("fails when the UI changes %s", (_label, mutate, message) => {
    const trace = load("adk_NC10010556.json");
    mutate(factFindOf(trace));
    expect(() => compareFactFind(load("NC10010556.json"), trace)).toThrow(message);
  });

  it("catches an account the screen invents when the source lists none", () => {
    const trace = load("adk_NC10010556.json");
    const accounts = factFindOf(trace).customers[0].sections[1].content;
    // A second heading turns the rows below it into "unrelated" accounts.
    accounts.push({ type: "heading", text: "Accounts unrelated to the complaint" });
    accounts.push({
      type: "accordion",
      label: "Invented Saver (77110361409999)",
      content: [{ type: "grid", account_status: "OPEN" }],
    });
    expect(() => compareFactFind(load("NC10010556.json"), trace)).toThrow(/unrelatedAccounts/);
  });

  it("tells a dropped accordion apart from one that says none recorded", () => {
    // NC10010449 has no support needs, so "none recorded" is the right screen and passes.
    expect(() => compareFactFind(load("NC10010449.json"), load("adk_NC10010449.json"))).not.toThrow();

    const trace = load("adk_NC10010449.json");
    const customer = factFindOf(trace).customers[0];
    customer.sections = customer.sections.filter((section: { label?: string }) =>
      !/support needs/i.test(section.label ?? ""),
    );
    expect(() => compareFactFind(load("NC10010449.json"), trace)).toThrow(
      /supportNeeds: section missing/,
    );
  });

  it("refuses a payload paired with another complaint's trace", () => {
    expect(() => compareFactFind(load("NC10010449.json"), load("adk_NC10010556.json"))).toThrow(
      /complaintRef does not match/,
    );
  });

  it("reports one failure per failed verdict, and skips what it cannot assert", () => {
    const trace = load("adk_NC10010556.json");
    const factFind = factFindOf(trace);
    factFind.customers[0].sections[0].content[0].date_of_birth = "19/08/1991";
    factFind.customers[0].sections[1].content[1].items[0][0].content[0].overdraft_amount = "";

    const result = runCompare(
      readSourceView(load("NC10010556.json"), factFindMap),
      readUiView(trace, factFindMap),
      factFindMap,
    );
    const rows = result.customers.flatMap((customer) => [
      ...customer.fields,
      ...customer.collections.flatMap((collection) => collection.rows.flatMap((row) => row.fields)),
    ]);

    expect(rows.filter((row) => row.verdict === "fail").map((row) => row.field)).toEqual(["dateOfBirth"]);
    // The blanked overdraft, the customer's single account, and the rows not on screen yet.
    expect([...new Set(rows.filter((row) => row.verdict === "skip").map((row) => row.field))].sort()).toEqual([
      "closed",
      "dateOfDeath",
      "gender",
      "overdraftAmount",
      "productGroup",
      "productType",
      "supportRequired",
      "unrelatedAccounts",
    ]);
    expect(failuresOf(result)).toHaveLength(1);
  });

  it("tolerates the contract's documented slack", () => {
    const trace = load("adk_NC10010556.json");
    const factFind = factFindOf(trace);
    // tenure is allowed to drift by a month, and money rows the UI omits are skipped
    factFind.customers[0].sections[0].content[4].time_with_bank = "2 years, 6 months";
    factFind.customers[0].sections[1].content[1].items[0][0].content[0].overdraft_amount = "";
    expect(() => compareFactFind(load("NC10010556.json"), trace)).not.toThrow();
  });
});
