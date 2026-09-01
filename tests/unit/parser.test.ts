import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdkContract, findByType } from "../../src/core/parser/adk-contract-parser.js";

describe("AdkContractParser", () => {
  const capture = JSON.parse(readFileSync(path.resolve("adk_NC10010449.json"), "utf8")) as unknown;

  it("parses agentOutput JSON string into a component tree", () => {
    const parsed = parseAdkContract(capture);
    expect(parsed.source).toBe("agentOutput");
    expect(parsed.raw.fact_find).toBeTruthy();
    expect(parsed.tree.length).toBeGreaterThan(0);
    const accordions = findByType(parsed.tree, "accordion");
    expect(accordions.some((a) => a.label === "Personal details")).toBe(true);
  });

  it("treats summaryBox and summarybox as the same type", () => {
    const parsed = parseAdkContract(capture);
    const boxes = findByType(parsed.tree, "summarybox");
    expect(boxes.length).toBeGreaterThan(0);
  });

  it("tags stable JSON paths on nodes", () => {
    const parsed = parseAdkContract(capture);
    const factFind = parsed.tree.find((n) => n.path === "fact_find");
    expect(factFind).toBeTruthy();
    expect(factFind?.children[0]?.path).toMatch(/^fact_find\.customers\[0\]/);
  });
});
