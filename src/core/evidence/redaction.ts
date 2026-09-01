const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\b(?:\+?44|0)\d{9,13}\b/g;
const NINO = /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/gi;

export function redactPii(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(EMAIL, "[REDACTED_EMAIL]").replace(PHONE, "[REDACTED_PHONE]").replace(NINO, "[REDACTED_NINO]");
  }
  if (Array.isArray(value)) return value.map(redactPii);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactPii(v);
    }
    return out;
  }
  return value;
}
