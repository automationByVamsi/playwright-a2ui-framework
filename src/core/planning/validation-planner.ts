export interface ValidationPlan {
  agentId: string;
  scenario: string;
  checks: string[];
  requiredCustomerSections: string[];
}

export const COMPLAINTS_WORKFLOW_PLAN: ValidationPlan = {
  agentId: "complaints-workflow",
  scenario: "customer-profile",
  checks: [
    "customer.count",
    "customer.identity",
    "customer.personalDetails",
    "customer.address",
    "customer.sections",
    "account.count",
    "account.identity",
    "account.fields",
    "account.duplicates",
    "contactNotes.presence",
    "supportNeeds.presence",
    "relatedParties.presence",
    "groundedness",
    "complaintRef",
  ],
  requiredCustomerSections: [
    "Personal details",
    "Accounts and products",
    "Contact notes",
    "Support needs",
    "Related parties",
  ],
};

export function planForScenario(agentId: string, scenario: string): ValidationPlan {
  return { ...COMPLAINTS_WORKFLOW_PLAN, agentId, scenario };
}

/** Maps the Gherkin `section` table used in the work-repo feature to engine checks. */
export const SECTION_TO_CHECKS: Record<string, string[]> = {
  customerprofile: [
    "customer.count",
    "customer.identity",
    "customer.personalDetails",
    "customer.address",
    "complaintRef",
  ],
  accounts: ["account.count", "account.identity", "account.fields", "account.duplicates"],
  contactnotes: ["contactNotes.presence"],
  supportneeds: ["supportNeeds.presence"],
  relatedparties: ["relatedParties.presence"],
};

export function planForTargetSections(
  agentId: string,
  scenario: string,
  targetSections?: string[],
): ValidationPlan {
  const base = planForScenario(agentId, scenario);
  if (!targetSections?.length) return base;
  const keys = targetSections.map((s) => s.trim()).filter(Boolean);
  if (keys.some((k) => k.toLowerCase() === "all")) return base;

  const checks = new Set<string>();
  for (const key of keys) {
    const mapped = SECTION_TO_CHECKS[key.toLowerCase().replace(/[\s_-]/g, "")];
    if (mapped) mapped.forEach((c) => checks.add(c));
  }
  if (checks.size === 0) return base;
  return { ...base, checks: [...checks] };
}
