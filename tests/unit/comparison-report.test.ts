import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareFactFind,
  compareFactFindReport,
} from "../../src/agents/complaints-workflow/complaints-rules.js";
import type { FindingStatus } from "../../src/agents/complaints-workflow/comparison-report.js";

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

/** The 556 trace, with one thing about the screen changed. */
function damaged(mutate: (factFind: any) => void) {
  const trace = load("adk_NC10010556.json");
  mutate(factFindOf(trace));
  return compareFactFindReport(load("NC10010556.json"), trace);
}

function statuses(report: { findings: Array<{ status: FindingStatus }> }): FindingStatus[] {
  return [...new Set(report.findings.map((finding) => finding.status))].sort();
}

describe("comparison report", () => {
  it("passes both refs, reporting only what it could not assert", () => {
    for (const ref of ["NC10010449", "NC10010556"]) {
      const report = compareFactFindReport(load(`${ref}.json`), load(`adk_${ref}.json`));
      expect(report.complaintRef).toBe(ref);
      expect(report.passed).toBe(true);
      expect(report.fieldsChecked).toBeGreaterThan(90);
      expect(statuses(report)).toEqual(["NOT ASSESSABLE"]);
      expect(report.summary["NOT ASSESSABLE"]).toBe(report.findings.length);
    }
  });

  it("names the rows it could not assert", () => {
    const report = compareFactFindReport(load("NC10010556.json"), load("adk_NC10010556.json"));
    const gender = report.findings.find((finding) => finding.field === "gender");
    expect(gender).toMatchObject({
      section: "customer_profile",
      partyId: "68905187",
      status: "NOT ASSESSABLE",
      sourceValue: "FEMALE",
      agentValue: "",
    });
  });

  it.each<[string, FindingStatus, (factFind: any) => void]>([
    ["a changed value", "VALUE MISMATCH", (ff) => {
      ff.customers[0].sections[0].content[0].date_of_birth = "19/08/1991";
    }],
    ["a blanked value", "MISSING FIELD", (ff) => {
      ff.customers[0].sections[0].content[0].name = "";
    }],
    ["an invented account", "EXTRA FIELD", (ff) => {
      ff.customers[0].sections[1].content.push({ type: "heading", text: "Accounts unrelated to the complaint" });
      ff.customers[0].sections[1].content.push({ type: "accordion", label: "Invented Saver (77110361409999)", content: [] });
    }],
    ["a dropped support need", "MISSING ITEM", (ff) => {
      ff.customers[0].sections[3].content[0].items.pop();
    }],
    ["a dropped accordion", "MISSING SECTION", (ff) => {
      ff.customers[0].sections = ff.customers[0].sections.filter(
        (section: { label?: string }) => !/related parties/i.test(section.label ?? ""),
      );
    }],
  ])("reports %s as %s", (_label, status, mutate) => {
    const report = damaged(mutate);
    expect(report.passed).toBe(false);
    expect(statuses(report)).toContain(status);
    expect(report.summary[status]).toBeGreaterThan(0);
  });

  it("never disagrees with what compareFactFind throws on", () => {
    const cases: Array<(factFind: any) => void> = [
      () => {},
      (ff) => { ff.customers[0].sections[0].content[0].age = "99"; },
      (ff) => { ff.customers[0].sections[1].content[1].items[0][0].content[0].overdraft_amount = ""; },
      (ff) => { ff.customers[0].sections[0].content[4].time_with_bank = "2 years, 6 months"; },
      (ff) => { ff.customers[0].sections[5].content[0].items[0][2].brand = "Halifax"; },
    ];

    for (const mutate of cases) {
      const trace = load("adk_NC10010556.json");
      mutate(factFindOf(trace));
      const threw = (() => {
        try {
          compareFactFind(load("NC10010556.json"), trace);
          return false;
        } catch {
          return true;
        }
      })();
      expect(compareFactFindReport(load("NC10010556.json"), trace).passed).toBe(!threw);
    }
  });
});
