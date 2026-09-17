import assert from "node:assert/strict";

/**
 * Step-1: Fact Find UI vs aggregated Fact Find source.
 *
 * Reads final_agent_response first (Bruno / raw_events), then agentOutput.
 * Compares fact_find only — not summaryBox / analysis / groundedness.
 *
 * Keyed by party id so 1 or N customers works. Add fields to CustomerFacts
 * and fill both extractors, then compareFactFind picks them up.
 */

export type AccountFacts = {
  number: string;
  related: boolean;
  status: string;
  opened: string;
  role: string;
  partyIds: string[];
};

export type CustomerFacts = {
  partyId: string;
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: string;
  maritalStatus: string;
  addressLines: string[];
  postcode: string;
  relatedAccounts: string[];
  unrelatedAccounts: string[];
  accounts: AccountFacts[];
  supportNeeds: string[];
  relatedParties: string[];
  contactNotes: string[];
};

export type FactFindFacts = {
  partyIds: string[];
  icaAccounts: string[];
  customers: Record<string, CustomerFacts>;
};

function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

function lower(value: unknown): string {
  return str(value).toLowerCase();
}

export function first14(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 14);
}

function toIsoDate(value: unknown): string {
  const raw = str(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (uk) return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  return raw;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const obj = rec(parsed);
    return Object.keys(obj).length > 0 ? obj : null;
  } catch {
    return null;
  }
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  const obj = rec(node);
  if (Object.keys(obj).length === 0) return;
  visit(obj);
  walk(obj.content, visit);
  walk(obj.items, visit);
  walk(obj.sections, visit);
  walk(obj.customers, visit);
  walk(obj.children, visit);
}

function labelsOf(needs: unknown[]): string[] {
  return uniqueSorted(
    needs.map((need) => {
      if (typeof need === "string") return need;
      const obj = rec(need);
      return str(obj.description ?? obj.need ?? obj.type ?? obj.name ?? obj.code ?? obj.text);
    }),
  );
}

function emptyOrItems(texts: string[], nonePattern: RegExp): string[] {
  const joined = texts.join("\n");
  if (!joined.trim() || nonePattern.test(joined)) return [];
  return uniqueSorted(texts);
}

/** UI object with fact_find. Prefers final_agent_response over agentOutput string. */
export function readFactFindUi(adk: unknown): Record<string, unknown> {
  const events = Array.isArray(adk) ? adk : arr(rec(adk).raw_events);
  for (const event of events) {
    const final = rec(rec(rec(rec(event).actions).stateDelta).final_agent_response);
    if (final.fact_find) return final;
  }

  const root = rec(adk);
  if (typeof root.agentOutput === "string") {
    const ui = parseJsonObject(root.agentOutput);
    if (ui?.fact_find) return ui;
  }
  if (root.fact_find) return root;

  throw new Error(
    "No fact_find UI. Looked for final_agent_response, then agentOutput. Tool calls are ignored.",
  );
}

function sourcePartyIds(aggregated: unknown): string[] {
  const root = rec(aggregated);
  const derived = rec(root.derived);
  const ica = rec(rec(root.sources).ica);
  const fromDerived = [...arr(derived.customerFlowPartyIds), ...arr(derived.resolvedPartyIds)].map(str);
  if (fromDerived.some(Boolean)) return uniqueSorted(fromDerived);
  return uniqueSorted(arr(ica.customers).map((c) => str(rec(c).customerOCISID)));
}

function icaAccountNumbers(aggregated: unknown): string[] {
  return uniqueSorted(
    arr(rec(rec(rec(aggregated).sources).ica).items).map((item) =>
      first14(rec(item).accountNumberFull ?? rec(item).accountNumber),
    ),
  ).filter((account) => account.length >= 8);
}

function holdingsByParty(aggregated: unknown): Record<string, Record<string, unknown>> {
  const holding = rec(rec(rec(aggregated).sources).customerHolding);
  const byParty = rec(holding.customerHoldingsByParty);
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(byParty)) {
    out[str(id)] = rec(value);
  }
  return out;
}

export function extractFromAggregated(aggregated: unknown): FactFindFacts {
  const partyIds = sourcePartyIds(aggregated);
  const relatedIca = icaAccountNumbers(aggregated);
  const holdings = holdingsByParty(aggregated);
  const notesByParty = rec(rec(rec(aggregated).sources).contactNotesByParty);
  const trustedByParty = rec(rec(rec(aggregated).sources).trustedPartiesByParty);
  const customers: Record<string, CustomerFacts> = {};

  for (const partyId of partyIds) {
    const holding = rec(holdings[partyId]);
    const party = rec(holding.party);
    const address = rec(party.address);
    const products = arr(holding.product);
    const accounts: AccountFacts[] = products.map((product) => {
      const p = rec(product);
      const number = first14(p.accountNumber);
      return {
        number,
        related: relatedIca.includes(number),
        status: str(p.accountStatus).toUpperCase(),
        opened: toIsoDate(p.accountOpenedDate),
        role: str(p.productHeldRoleType).toUpperCase(),
        partyIds: uniqueSorted(arr(p.partyList).map((row) => str(rec(row).partyId))),
      };
    });

    customers[partyId] = {
      partyId,
      title: str(party.title),
      firstName: str(party.foreName ?? party.firstName),
      lastName: str(party.lastName),
      dateOfBirth: toIsoDate(party.dateOfBirth),
      age: str(party.age),
      maritalStatus: str(party.maritalStatus).toUpperCase(),
      addressLines: arr(address.addressLines).map(str).filter(Boolean),
      postcode: str(address.postcode),
      relatedAccounts: uniqueSorted(accounts.filter((a) => a.related).map((a) => a.number)),
      unrelatedAccounts: uniqueSorted(accounts.filter((a) => !a.related).map((a) => a.number)),
      accounts,
      supportNeeds: labelsOf(arr(rec(party.partyIndicator).supportNeeds)),
      relatedParties: labelsOf(arr(rec(trustedByParty[partyId]).trustedParties)),
      contactNotes: labelsOf(arr(rec(notesByParty[partyId]).notes)),
    };
  }

  return { partyIds, icaAccounts: relatedIca, customers };
}

function textsUnder(node: unknown): string[] {
  const texts: string[] = [];
  walk(node, (obj) => {
    if (typeof obj.text === "string" && obj.text.trim()) texts.push(obj.text.trim());
  });
  return texts;
}

function accordionByLabel(customer: unknown, matcher: RegExp): unknown {
  let found: unknown;
  walk(customer, (obj) => {
    if (found) return;
    if (lower(obj.type) === "accordion" && matcher.test(str(obj.label))) found = obj;
  });
  return found;
}

function extractUiCustomer(customer: unknown): CustomerFacts | null {
  let partyId = "";
  let name = "";
  let dateOfBirth = "";
  let age = "";
  let maritalStatus = "";
  let addressText = "";
  const accounts: AccountFacts[] = [];
  let related = false;

  walk(customer, (obj) => {
    if (obj.party_id != null && !partyId) partyId = str(obj.party_id);
    if (obj.name != null && !name) name = str(obj.name);
    if (obj.date_of_birth != null && !dateOfBirth) dateOfBirth = str(obj.date_of_birth);
    if (obj.age != null && !age) age = str(obj.age);
    if (obj.marital_status != null && !maritalStatus) maritalStatus = str(obj.marital_status);
    if (lower(obj.label).includes("residential address") && typeof obj.text === "string") {
      addressText = obj.text;
    }

    if (lower(obj.type) === "heading") {
      const text = lower(obj.text);
      if (text.includes("unrelated")) related = false;
      else if (text.includes("related") && text.includes("complaint")) related = true;
    }

    const accountNumber = first14(obj.label);
    if (lower(obj.type) === "accordion" && accountNumber.length >= 8) {
      const grid = rec(
        arr(obj.content).find((child) => lower(rec(child).type) === "grid") ?? {},
      );
      const partyIds: string[] = [];
      for (const [key, value] of Object.entries(grid)) {
        if (/^party_id/i.test(key) && value != null) partyIds.push(str(value));
      }
      accounts.push({
        number: accountNumber,
        related,
        status: str(grid.account_status).toUpperCase(),
        opened: toIsoDate(grid.account_opened),
        role: str(grid.customer_role_on_the_product).toUpperCase(),
        partyIds: uniqueSorted(partyIds),
      });
    }
  });

  if (!partyId) return null;

  const parts = name.split(/\s+/).filter(Boolean);
  const title = /^(ms|mr|mrs|miss|mx|dr)$/i.test(parts[0] ?? "") ? parts[0] : "";
  const lastName = parts.length ? parts[parts.length - 1] : "";
  const firstName = parts.slice(title ? 1 : 0, -1).join(" ");
  const postcodeMatch = addressText.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i);

  return {
    partyId,
    title,
    firstName,
    lastName,
    dateOfBirth: toIsoDate(dateOfBirth),
    age,
    maritalStatus: maritalStatus.toUpperCase(),
    addressLines: addressText
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter(Boolean),
    postcode: (postcodeMatch?.[0] ?? "").replace(/\s+/g, " ").toUpperCase(),
    relatedAccounts: uniqueSorted(accounts.filter((a) => a.related).map((a) => a.number)),
    unrelatedAccounts: uniqueSorted(accounts.filter((a) => !a.related).map((a) => a.number)),
    accounts,
    supportNeeds: emptyOrItems(textsUnder(accordionByLabel(customer, /support\s*needs/i)), /no support needs/i),
    relatedParties: emptyOrItems(textsUnder(accordionByLabel(customer, /related parties/i)), /no related parties/i),
    contactNotes: emptyOrItems(textsUnder(accordionByLabel(customer, /contact notes/i)), /no contact notes/i),
  };
}

export function extractFromAgentOutput(adk: unknown): FactFindFacts {
  const ui = readFactFindUi(adk);
  const customers: Record<string, CustomerFacts> = {};
  for (const customer of arr(rec(ui.fact_find).customers)) {
    const facts = extractUiCustomer(customer);
    if (facts) customers[facts.partyId] = facts;
  }
  return {
    partyIds: uniqueSorted(Object.keys(customers)),
    icaAccounts: uniqueSorted(Object.values(customers).flatMap((c) => c.relatedAccounts)),
    customers,
  };
}

function sameSet(left: string[], right: string[]): boolean {
  return JSON.stringify(uniqueSorted(left)) === JSON.stringify(uniqueSorted(right));
}

function nameShown(source: CustomerFacts, ui: CustomerFacts): boolean {
  const shown = lower(`${ui.title} ${ui.firstName} ${ui.lastName}`);
  return [source.title, source.firstName, source.lastName]
    .map(lower)
    .filter(Boolean)
    .every((part) => shown.includes(part));
}

function addressShown(source: CustomerFacts, ui: CustomerFacts): boolean {
  const haystack = lower(ui.addressLines.join(" "));
  const linesOk = source.addressLines.every((line) => haystack.includes(lower(line)));
  const sourcePost = lower(source.postcode).replace(/\s+/g, "");
  const uiPost = lower(ui.postcode).replace(/\s+/g, "");
  const postOk = !sourcePost || haystack.replace(/\s+/g, "").includes(sourcePost) || sourcePost === uiPost;
  return linesOk && postOk;
}

export function compareFactFind(aggregated: unknown, adk: unknown): void {
  const source = extractFromAggregated(aggregated);
  const actual = extractFromAgentOutput(adk);
  const failures: string[] = [];

  if (!sameSet(source.partyIds, actual.partyIds)) {
    failures.push(
      `partyIds do not match.\n  source: ${source.partyIds.join(", ") || "(none)"}\n  adk:    ${actual.partyIds.join(", ") || "(none)"}`,
    );
  }

  for (const partyId of source.partyIds) {
    const expected = source.customers[partyId];
    const ui = actual.customers[partyId];
    const prefix = `party ${partyId}`;
    if (!expected) continue;
    if (!ui) {
      failures.push(`${prefix}: missing from fact_find`);
      continue;
    }

    if (!nameShown(expected, ui)) {
      failures.push(
        `${prefix} name: source "${expected.title} ${expected.firstName} ${expected.lastName}" not in UI "${ui.title} ${ui.firstName} ${ui.lastName}"`,
      );
    }
    if (expected.dateOfBirth && expected.dateOfBirth !== ui.dateOfBirth) {
      failures.push(`${prefix} dateOfBirth: source ${expected.dateOfBirth} adk ${ui.dateOfBirth || "(empty)"}`);
    }
    if (expected.age && expected.age !== ui.age) {
      failures.push(`${prefix} age: source ${expected.age} adk ${ui.age || "(empty)"}`);
    }
    if (expected.maritalStatus && expected.maritalStatus !== ui.maritalStatus) {
      failures.push(
        `${prefix} maritalStatus: source ${expected.maritalStatus} adk ${ui.maritalStatus || "(empty)"}`,
      );
    }
    if (!addressShown(expected, ui)) {
      failures.push(
        `${prefix} address: source ${[...expected.addressLines, expected.postcode].join(", ")} adk ${ui.addressLines.join(", ")}`,
      );
    }

    for (const account of expected.relatedAccounts) {
      if (!ui.relatedAccounts.includes(account)) {
        failures.push(
          `${prefix} related account ${account} missing.\n  adk related: ${ui.relatedAccounts.join(", ") || "(none)"}`,
        );
      }
    }

    const uiAll = uniqueSorted([...ui.relatedAccounts, ...ui.unrelatedAccounts]);
    const sourceAll = uniqueSorted([...expected.relatedAccounts, ...expected.unrelatedAccounts]);
    if (!sameSet(sourceAll, uiAll)) {
      failures.push(
        `${prefix} accounts do not match.\n  source: ${sourceAll.join(", ") || "(none)"}\n  adk:    ${uiAll.join(", ") || "(none)"}`,
      );
    }

    for (const expectedAccount of expected.accounts) {
      const uiAccount = ui.accounts.find((row) => row.number === expectedAccount.number);
      if (!uiAccount) continue;
      if (expectedAccount.status && uiAccount.status && expectedAccount.status !== uiAccount.status) {
        failures.push(
          `${prefix} account ${expectedAccount.number} status: source ${expectedAccount.status} adk ${uiAccount.status}`,
        );
      }
      if (expectedAccount.opened && uiAccount.opened && expectedAccount.opened !== uiAccount.opened) {
        failures.push(
          `${prefix} account ${expectedAccount.number} opened: source ${expectedAccount.opened} adk ${uiAccount.opened}`,
        );
      }
      if (expectedAccount.role && uiAccount.role && expectedAccount.role !== uiAccount.role) {
        failures.push(
          `${prefix} account ${expectedAccount.number} role: source ${expectedAccount.role} adk ${uiAccount.role}`,
        );
      }
      if (uiAccount.partyIds.length > 0 && !sameSet(expectedAccount.partyIds, uiAccount.partyIds)) {
        failures.push(
          `${prefix} account ${expectedAccount.number} parties: source ${expectedAccount.partyIds.join(", ")} adk ${uiAccount.partyIds.join(", ")}`,
        );
      }
    }

    if (!sameSet(expected.supportNeeds, ui.supportNeeds)) {
      failures.push(
        `${prefix} supportNeeds: source [${expected.supportNeeds.join("; ")}] adk [${ui.supportNeeds.join("; ")}]`,
      );
    }
    if (!sameSet(expected.relatedParties, ui.relatedParties)) {
      failures.push(
        `${prefix} relatedParties: source [${expected.relatedParties.join("; ")}] adk [${ui.relatedParties.join("; ")}]`,
      );
    }
    if (!sameSet(expected.contactNotes, ui.contactNotes)) {
      failures.push(
        `${prefix} contactNotes: source [${expected.contactNotes.join("; ")}] adk [${ui.contactNotes.join("; ")}]`,
      );
    }
  }

  assert.equal(failures.length, 0, `Fact-find mismatch:\n\n${failures.join("\n\n")}`);
}

export function assertComplaintsRules(aggregated: unknown, adk: unknown): void {
  compareFactFind(aggregated, adk);
}
