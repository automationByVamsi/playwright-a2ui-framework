import { describe, expect, it } from "vitest";
import { humanizeKey } from "../../src/engine/humanize.js";
import { registeredTypes } from "../../src/engine/registry.js";

describe("A2UI adapter registry", () => {
  it("humanizes snake_case and mixed party_ID keys", () => {
    expect(humanizeKey("time_with_bank")).toBe("time with bank");
    expect(humanizeKey("party_ID_1").toLowerCase()).toBe("party id 1");
  });

  it("ships the core catalog adapters", () => {
    expect(registeredTypes()).toEqual(
      expect.arrayContaining(["accordion", "grid", "summarybox", "block", "list", "heading", "text", "divider"]),
    );
  });
});
