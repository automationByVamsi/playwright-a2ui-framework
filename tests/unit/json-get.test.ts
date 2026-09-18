import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getDetailsFromJson,
  readFactFindUi,
} from "../../src/agents/complaints-workflow/json-get.js";

function load(name: string) {
  return JSON.parse(readFileSync(path.resolve("fixtures", name), "utf8"));
}

function customers(file: string): unknown[] {
  return getDetailsFromJson(readFactFindUi(load(file)), "fact_find.customers") as unknown[];
}

describe("getDetailsFromJson", () => {
  const one = () => customers("adk_NC10010556.json")[0];

  it("reads dotted paths on aggregated JSON", () => {
    const aggregated = load("NC10010556.json");
    const party = "sources.customerHolding.customerHoldingsByParty.68905187.party";
    expect(getDetailsFromJson(aggregated, `${party}.dateOfBirth`)).toBe("1990-08-19");
    expect(getDetailsFromJson(aggregated, `${party}.partyIndicator.supportNeeds[*].description`)).toEqual([
      "3P - 3rd Party Mandate",
      "DO NOT USE - Need for Quiet",
      "Adapt - Longer Appointment",
      "Domestic/Financial Abuse",
      "Life Event - Flexibility",
    ]);
    expect(getDetailsFromJson(aggregated, `${party}.addressNotifications[0].notificationText`)).toBe(
      "Recent change of Address",
    );
    expect(getDetailsFromJson(aggregated, `${party}.missing.deeper`)).toBeUndefined();
  });

  it("reads date_of_birth once, scoped to the Personal details accordion", () => {
    expect(getDetailsFromJson(one(), { accordion: "Personal details", key: "date_of_birth" })).toBe(
      "19/08/1990",
    );
  });

  it("scopes name to its accordion instead of colliding with the related party name", () => {
    expect(getDetailsFromJson(one(), { accordion: "Personal details", key: "name" })).toBe(
      "Mrs Monica Gabi Adaeze Geller",
    );
    const parties = getDetailsFromJson(one(), {
      accordion: "Related parties",
      list: true,
      empty: /no related parties/i,
      key: "name",
    });
    expect(parties).toEqual(["Mr M Kerch"]);
  });

  it("finds a labelled block, not a bare text", () => {
    expect(getDetailsFromJson(one(), { accordion: "Personal details", label: "Residential address", key: "tag" })).toBe(
      "Recent change of Address",
    );
    expect(getDetailsFromJson(one(), { accordion: "Personal details", label: "Residential address", key: "text" })).toContain(
      "AB23 8HN",
    );
  });

  it("returns support needs as list rows keyed by notification heading", () => {
    const headings = getDetailsFromJson(one(), {
      accordion: "Support needs",
      list: true,
      empty: /no support needs/i,
      key: "heading",
    }) as string[];
    expect(headings).toHaveLength(5);
    expect(headings[0]).toBe("Support need: 3P - 3rd Party Mandate");
    const rows = getDetailsFromJson(one(), { accordion: "Support needs", list: true }) as unknown[][];
    expect(rows).toHaveLength(5);
    expect(getDetailsFromJson(rows[2], { key: "consent_status" })).toBe("Notified by 3rd Party - CARERS Drill");
  });

  it("keeps Contact date and Contact details apart", () => {
    const at = { accordion: "Contact Notes", list: true, empty: /no contact notes/i } as const;
    const dates = getDetailsFromJson(one(), { ...at, label: "Contact date", key: "text" }) as string[];
    const details = getDetailsFromJson(one(), { ...at, label: "Contact details", key: "text" }) as string[];
    expect(dates).toEqual([
      "10/09/2026 12:49:00",
      "10/09/2026 12:43:00",
      "10/09/2026 06:01:00",
      "09/09/2026 13:57:00",
      "09/09/2026 13:33:00",
    ]);
    expect(details).toHaveLength(5);
    expect(details.every((text) => text.startsWith("Cash Withdrawal"))).toBe(true);
  });

  it("returns [] for an empty-message accordion and undefined for a missing one", () => {
    const first = customers("adk_NC10010449.json")[0];
    expect(getDetailsFromJson(first, { accordion: "Support needs", list: true, empty: /no support needs/i })).toEqual([]);
    expect(getDetailsFromJson(first, { accordion: "Contact notes", list: true, empty: /no contact notes/i })).toEqual([]);
    // Present but empty reads as its message; absent reads as undefined.
    expect(getDetailsFromJson(first, { accordion: "Card Freeze Audit Events", key: "text" })).toBe(
      "No card freeze audit events for this customer.",
    );
    expect(getDetailsFromJson(first, { accordion: "Mortgages and loans", key: "text" })).toBeUndefined();
  });

  it("splits account accordions by the related / unrelated heading", () => {
    const first = customers("adk_NC10010449.json")[0];
    const at = { accordion: "Accounts and products", key: "label" } as const;
    expect(getDetailsFromJson(first, { ...at, accounts: true })).toEqual([
      "LTPB Current (77110364287668)",
      "Easy Saver (77110364291360)",
      "LTPB Current (77110364291768)",
    ]);
    expect(getDetailsFromJson(first, { ...at, accounts: "related" })).toEqual(["LTPB Current (77110364287668)"]);
    expect(getDetailsFromJson(first, { ...at, accounts: "unrelated" })).toEqual([
      "Easy Saver (77110364291360)",
      "LTPB Current (77110364291768)",
    ]);
  });

  it("reads every party_ID key of one account grid", () => {
    const first = customers("adk_NC10010449.json")[0];
    const accounts = getDetailsFromJson(first, { accordion: "Accounts and products", accounts: "related" }) as unknown[];
    expect(getDetailsFromJson(accounts[0], { keys: /^party_id/i })).toEqual(["46142591", "1420289780"]);
  });

  it("matches accordion labels case-insensitively", () => {
    // The traces label these "Personal details" and "Contact Notes".
    const first = customers("adk_NC10010449.json")[0];
    expect(getDetailsFromJson(first, { accordion: "PERSONAL DETAILS", key: "party_id" })).toBe("46142591");
    expect(getDetailsFromJson(first, { accordion: "contact notes", list: true, empty: /no contact notes/i })).toEqual([]);
    expect(getDetailsFromJson(one(), { accordion: "SUPPORT NEEDS", list: true, key: "heading" })).toHaveLength(5);
  });
});
