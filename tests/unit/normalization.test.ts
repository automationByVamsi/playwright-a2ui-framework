import { describe, expect, it } from "vitest";
import {
  canonicalAccountNumber,
  canonicalDuration,
  canonicalIsoDate,
  canonicalMoneyMinor,
  canonicalNameFromDisplay,
  canonicalNameFromParts,
  moneyEquals,
  namesMatch,
} from "../../src/core/normalization/index.js";
import { EMPTY } from "../../src/core/models/normalized.js";

describe("NormalizationEngine", () => {
  it("takes the first 14 digits of a padded account number", () => {
    expect(canonicalAccountNumber("7711036429136000000")).toBe("77110364291360");
    expect(canonicalAccountNumber("77110364287668")).toBe("77110364287668");
    expect(canonicalAccountNumber("LTPB Current 77110364287668")).toBe("77110364287668");
  });

  it("normalizes DOB from ISO and DD/MM/YYYY", () => {
    expect(canonicalIsoDate("1964-12-22")).toBe("1964-12-22");
    expect(canonicalIsoDate("22/12/1964")).toBe("1964-12-22");
    expect(canonicalIsoDate("01/06/1967")).toBe("1967-06-01");
  });

  it("normalizes money strings and numbers to minor units", () => {
    expect(canonicalMoneyMinor(0)).toBe(0);
    expect(canonicalMoneyMinor("£0.00")).toBe(0);
    expect(canonicalMoneyMinor("")).toBe(EMPTY);
    expect(moneyEquals(0, EMPTY)).toBe(true);
  });

  it("matches names with optional title", () => {
    const fromParts = canonicalNameFromParts("Ms", "Alexandra", "Taylor");
    const fromDisplay = canonicalNameFromDisplay("Ms Alexandra Taylor");
    expect(namesMatch(fromParts, fromDisplay)).toBe(true);
    expect(namesMatch(fromParts, canonicalNameFromDisplay("Alexandra Taylor"))).toBe(true);
  });

  it("normalizes time-with-bank phrases to months", () => {
    expect(canonicalDuration("0 Years, 10 Months").totalMonths).toBe(10);
    expect(canonicalDuration("10 months").totalMonths).toBe(10);
  });
});
