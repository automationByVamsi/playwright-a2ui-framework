import { EMPTY, type EmptySentinel, type NormalizedAddress, type NormalizedDuration, type NormalizedName } from "../models/normalized.js";

const TITLE_TOKENS = new Set(["ms", "mr", "mrs", "miss", "dr", "mx", "sir", "dame"]);

const EMPTY_TEXT = [
  /^no .+ recorded\.?$/i,
  /^no .+ for this customer\.?$/i,
  /^none$/i,
  /^no data(?: available)?\.?$/i,
  /^n\/a$/i,
];

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function canonicalPartyId(value: unknown): string {
  return String(value ?? "").trim();
}

/** Strip non-digits, keep the first 14 digits. */
export function canonicalAccountNumber(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.slice(0, 14);
}

export function canonicalIsoDate(value: unknown): string {
  if (isBlank(value)) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${month}-${day}`;
  }
  return s;
}

/**
 * Money → integer minor units (pence).
 * Source balances are major units (pounds). UI strings like "£0.00" are parsed as pounds.
 */
export function canonicalMoneyMinor(value: unknown): number | EmptySentinel {
  if (isBlank(value)) return EMPTY;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const s = String(value).replace(/[£$€,\s]/g, "").trim();
  if (s === "") return EMPTY;
  const n = Number(s);
  if (Number.isNaN(n)) return EMPTY;
  return Math.round(n * 100);
}

export function moneyEquals(
  expected: number | EmptySentinel,
  actual: number | EmptySentinel,
): boolean {
  if (expected === actual) return true;
  // Blank contract money vs zero source (e.g. savings overdraft) is equivalent.
  if ((expected === 0 && actual === EMPTY) || (expected === EMPTY && actual === 0)) {
    return true;
  }
  return false;
}

export function canonicalNameFromParts(
  title: unknown,
  first: unknown,
  last: unknown,
): NormalizedName {
  const t = isBlank(title) ? undefined : String(title).trim();
  const f = String(first ?? "").trim();
  const l = String(last ?? "").trim();
  const display = [t, f, l].filter(Boolean).join(" ");
  return { title: t, first: f, last: l, display };
}

export function canonicalNameFromDisplay(value: unknown): NormalizedName {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: "", last: "", display: "" };
  }
  if (parts.length >= 2 && TITLE_TOKENS.has(parts[0].toLowerCase().replace(/\./g, ""))) {
    return {
      title: parts[0],
      first: parts[1],
      last: parts.slice(2).join(" "),
      display: parts.join(" "),
    };
  }
  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
    display: parts.join(" "),
  };
}

export function namesMatch(expected: NormalizedName, actual: NormalizedName): boolean {
  const first = expected.first.toLowerCase() === actual.first.toLowerCase();
  const last = expected.last.toLowerCase() === actual.last.toLowerCase();
  if (first && last) return true;
  return expected.display.replace(/\s+/g, " ").toLowerCase() ===
    actual.display.replace(/\s+/g, " ").toLowerCase();
}

export function canonicalAddress(lines: Array<string | null | undefined>, postcode?: string | null): NormalizedAddress {
  const cleaned = lines
    .map((l) => (l == null ? "" : String(l).trim()))
    .filter((l) => l.length > 0);
  const pc = postcode ? String(postcode).trim() : undefined;
  const canonical = [...cleaned, pc]
    .filter(Boolean)
    .join(" ")
    .replace(/[,\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return { lines: cleaned, postcode: pc, canonical };
}

export function canonicalAddressFromText(text: unknown): NormalizedAddress {
  const parts = String(text ?? "")
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const postcode = parts.find((p) => /^[A-Z]{1,2}\d/i.test(p));
  const lines = parts.filter((p) => p !== postcode);
  return canonicalAddress(lines, postcode);
}

export function addressesMatch(expected: NormalizedAddress, actual: NormalizedAddress): boolean {
  return expected.canonical === actual.canonical;
}

export function canonicalDuration(value: unknown): NormalizedDuration {
  const s = String(value ?? "").toLowerCase();
  const years = s.match(/(\d+)\s*years?/);
  const months = s.match(/(\d+)\s*months?/);
  const y = years ? Number(years[1]) : 0;
  const m = months ? Number(months[1]) : 0;
  if (!years && !months) {
    const n = Number(String(value).replace(/\D/g, ""));
    return { totalMonths: Number.isFinite(n) ? n : 0 };
  }
  return { totalMonths: y * 12 + m };
}

export function isEmptyText(value: unknown): boolean {
  if (isBlank(value)) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  const s = String(value).trim();
  return EMPTY_TEXT.some((re) => re.test(s));
}

export function canonicalEmptyOrList(value: unknown): EmptySentinel | string[] {
  if (isEmptyText(value)) return EMPTY;
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean);
    return items.length === 0 ? EMPTY : items;
  }
  return [String(value).trim()];
}

export function canonicalAge(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function canonicalStatus(value: unknown): string {
  if (isEmptyText(value) || isBlank(value)) return EMPTY;
  return String(value).trim().toUpperCase();
}

export function canonicalIndicators(value: unknown): EmptySentinel | string {
  if (isBlank(value) || value === null || isEmptyText(value)) return EMPTY;
  if (Array.isArray(value) && value.length === 0) return EMPTY;
  const s = String(value).trim();
  if (s.toLowerCase() === "none") return EMPTY;
  return s;
}
