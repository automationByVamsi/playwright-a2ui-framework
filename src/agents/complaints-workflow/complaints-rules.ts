import assert from "node:assert/strict";

/**
 * Step-1: Fact Find UI vs aggregated Fact Find source.
 *
 * Reads final_agent_response first (Bruno / raw_events), then agentOutput.
 * Compares fact_find only — not summaryBox / analysis / groundedness.
 *
 * Compare contract is the Fact Find screen: personal details, accounts,
 * related parties, support needs, contact notes. Live chat and card freeze
 * are not compared. Add a field here only if both extractors can fill it.
 */

export type AccountFacts = {
  number: string;
  productName: string;
  related: boolean;
  status: string;
  opened: string;
  role: string;
  productIndicators: string;
  currentBalance: string;
  balanceAfterPending: string;
  overdraftAmount: string;
  finalAvailableBalance: string;
  partiesOnAccount: string;
  partyIds: string[];
};

export type SupportNeedFacts = {
  description: string;
  lastChanged: string;
  dateRecorded: string;
  consentStatus: string;
  nextReview: string;
  furtherInformation: string;
};

export type RelatedPartyFacts = {
  relationship: string;
  relationshipCode: string;
  name: string;
  relatedPartyId: string;
  partyType: string;
};

export type ContactNoteFacts = {
  contactAt: string;
  details: string;
  classification: string;
  outcome: string;
  direction: string;
  method: string;
  location: string;
  associatedCaseId: string;
  brand: string;
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
  addressTag: string;
  timeWithBank: string;
  relatedAccounts: string[];
  unrelatedAccounts: string[];
  accounts: AccountFacts[];
  supportNeeds: SupportNeedFacts[];
  relatedParties: RelatedPartyFacts[];
  contactNotes: ContactNoteFacts[];
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

function collapse(value: unknown): string {
  return lower(value).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

function toIsoDateTime(value: unknown): string {
  const raw = str(value)
    .replace(/^last changed:\s*/i, "")
    .replace(/^ongoing.*$/i, "");
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? "00"}:${iso[5] ?? "00"}:${iso[6] ?? "00"}`;
  }
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (uk) {
    return `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}T${(uk[4] ?? "00").padStart(2, "0")}:${uk[5] ?? "00"}:${uk[6] ?? "00"}`;
  }
  return toIsoDate(raw);
}

function hasClock(value: unknown): boolean {
  return /\d{1,2}:\d{2}/.test(str(value));
}

function sameMoment(source: string, ui: string): boolean {
  if (!source) return true;
  if (!ui) return false;
  if (/ongoing/i.test(source) || /ongoing/i.test(ui)) {
    return /ongoing/i.test(source) && /ongoing/i.test(ui);
  }
  if (toIsoDateTime(source) === toIsoDateTime(ui)) return true;
  if (!hasClock(source) || !hasClock(ui)) return toIsoDate(source) === toIsoDate(ui);
  return false;
}

function money(value: unknown): string {
  if (value == null || value === "") return "";
  const numeric = str(value).replace(/[£GBP,\s]/gi, "");
  const parsed = Number(numeric);
  if (Number.isNaN(parsed)) return str(value);
  return parsed.toFixed(2);
}

function sameMoney(source: string, ui: string): boolean {
  if (!source || !ui) return true;
  return money(source) === money(ui);
}

function parseTenure(value: string): { years: number; months: number } | null {
  const text = lower(value);
  if (!text) return null;
  const years = Number(text.match(/(\d+)\s*years?/)?.[1] ?? 0);
  const months = Number(text.match(/(\d+)\s*months?/)?.[1] ?? 0);
  if (!/\d/.test(text)) return null;
  return { years, months };
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

function noneMessage(node: unknown, pattern: RegExp): boolean {
  let hit = false;
  walk(node, (obj) => {
    if (pattern.test(str(obj.text))) hit = true;
  });
  return hit;
}

function listGroups(node: unknown): unknown[][] {
  const groups: unknown[][] = [];
  walk(node, (obj) => {
    if (lower(obj.type) !== "list") return;
    for (const row of arr(obj.items)) {
      groups.push(Array.isArray(row) ? row : [row]);
    }
  });
  return groups;
}

function groupRecord(group: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of group) {
    Object.assign(out, rec(item));
    const block = rec(item);
    if (block.label != null && block.text != null) {
      out[collapse(block.label)] = block.text;
    }
  }
  return out;
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

function accountDetailsByNumber(aggregated: unknown): Record<string, Record<string, unknown>> {
  const details = rec(rec(rec(aggregated).sources).accountDetails);
  const out: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(details)) {
    out[first14(id)] = rec(rec(value).details);
  }
  return out;
}

function notesForParty(aggregated: unknown, partyId: string): unknown[] {
  const sources = rec(rec(aggregated).sources);
  const byParty = rec(rec(sources.contactNotesByParty)[partyId]);
  const nested = arr(byParty.notes);
  if (nested.length > 0) return nested;
  return arr(sources.contactNotes).filter((note) => str(rec(note).partyId) === partyId);
}

function productIndicatorsOf(details: Record<string, unknown>): string {
  const raw = details.indicators;
  if (raw == null) return "none";
  if (Array.isArray(raw)) {
    const labels = uniqueSorted(
      raw.map((row) => str(typeof row === "string" ? row : rec(row).description ?? rec(row).code)),
    );
    return labels.length > 0 ? labels.join(", ") : "none";
  }
  const text = str(raw);
  return text ? text : "none";
}

function relatedPartyName(party: Record<string, unknown>, related: Record<string, unknown>): string {
  const relationship = str(related.relationshipDescription);
  for (const row of arr(party.relationshipNotifications)) {
    const text = str(rec(row).notificationText);
    if (!relationship || lower(text).startsWith(lower(relationship))) {
      return str(text.slice(relationship.length));
    }
  }
  return str(related.name ?? related.relatedPartyName);
}

function nextReviewOf(need: Record<string, unknown>): string {
  const raw = need.dateForReview ?? need.nextReview;
  if (raw == null || raw === "") return "ongoing";
  return toIsoDate(raw);
}

function sourceAccounts(
  products: unknown[],
  relatedIca: string[],
  detailsByNumber: Record<string, Record<string, unknown>>,
): AccountFacts[] {
  return products.map((product) => {
    const p = rec(product);
    const number = first14(p.accountNumber);
    const details = rec(detailsByNumber[number]);
    const balance = rec(details.balance);
    const partyIds = uniqueSorted(arr(p.partyList).map((row) => str(rec(row).partyId)));
    return {
      number,
      productName: str(p.accountName),
      related: relatedIca.includes(number),
      status: str(p.accountStatus).toUpperCase(),
      opened: toIsoDate(p.accountOpenedDate),
      role: str(p.productHeldRoleType).toUpperCase(),
      productIndicators: productIndicatorsOf(details),
      currentBalance: money(balance.currentBalance ?? balance.interimBookedBalance),
      balanceAfterPending: money(balance.interimAvailableWithCreditBalance),
      overdraftAmount: money(balance.overdraftAmount),
      finalAvailableBalance: money(balance.interimAvailableBalance),
      partiesOnAccount: partyIds.length ? String(partyIds.length) : "",
      partyIds,
    };
  });
}

function sourceSupportNeeds(party: Record<string, unknown>): SupportNeedFacts[] {
  return arr(rec(party.partyIndicator).supportNeeds).map((row) => {
    const need = rec(row);
    return {
      description: str(need.description ?? need.need ?? need.type),
      lastChanged: toIsoDateTime(need.dateEdited ?? need.lastChanged),
      dateRecorded: toIsoDateTime(need.dateRecorded),
      consentStatus: str(need.consentStatus),
      nextReview: nextReviewOf(need),
      furtherInformation: str(need.furtherInformation),
    };
  });
}

function sourceRelatedParties(party: Record<string, unknown>): RelatedPartyFacts[] {
  return arr(party.relatedPartyList).map((row) => {
    const related = rec(row);
    return {
      relationship: str(related.relationshipDescription ?? related.relationship),
      relationshipCode: str(related.relatedPartyRelationshipCode ?? related.relationshipCode),
      name: relatedPartyName(party, related),
      relatedPartyId: str(related.relatedPartyId),
      partyType: str(related.relatedPartyType ?? related.partyType).toUpperCase(),
    };
  });
}

function sourceContactNotes(notes: unknown[]): ContactNoteFacts[] {
  return notes.map((row) => {
    const note = rec(row);
    const date = str(note.contactDate);
    const time = str(note.contactTime);
    return {
      contactAt: toIsoDateTime(`${date} ${time}`.trim()),
      details: str(note.interactionText ?? note.contactDetails),
      classification: str(note.classificationCodeNarrative ?? note.classification),
      outcome: str(note.outcomeCodeNarrative ?? note.outcome),
      direction: str(note.directionCodeNarrative ?? note.direction),
      method: str(note.contactMediumCodeNarrative ?? note.method),
      location: str(note.locationCodeNarrative ?? note.location),
      associatedCaseId: str(note.caseId ?? note.associatedCaseId),
      brand: str(note.companyCodeNarrative ?? note.brand),
    };
  });
}

export function extractFromAggregated(aggregated: unknown): FactFindFacts {
  const partyIds = sourcePartyIds(aggregated);
  const relatedIca = icaAccountNumbers(aggregated);
  const holdings = holdingsByParty(aggregated);
  const detailsByNumber = accountDetailsByNumber(aggregated);
  const customers: Record<string, CustomerFacts> = {};

  for (const partyId of partyIds) {
    const holding = rec(holdings[partyId]);
    const party = rec(holding.party);
    const address = rec(party.address);
    const accounts = sourceAccounts(arr(holding.product), relatedIca, detailsByNumber);
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
      addressTag: str(rec(arr(party.addressNotifications)[0]).notificationText),
      timeWithBank: str(party.timeWithBank),
      relatedAccounts: uniqueSorted(accounts.filter((a) => a.related).map((a) => a.number)),
      unrelatedAccounts: uniqueSorted(accounts.filter((a) => !a.related).map((a) => a.number)),
      accounts,
      supportNeeds: sourceSupportNeeds(party),
      relatedParties: sourceRelatedParties(party),
      contactNotes: sourceContactNotes(notesForParty(aggregated, partyId)),
    };
  }

  return { partyIds, icaAccounts: relatedIca, customers };
}

function accordionByLabel(customer: unknown, matcher: RegExp): unknown {
  let found: unknown;
  walk(customer, (obj) => {
    if (found) return;
    if (lower(obj.type) === "accordion" && matcher.test(str(obj.label))) found = obj;
  });
  return found;
}

function productNameFromLabel(label: string): string {
  return str(label).replace(/\(\s*\d[\d\s]*\s*\)\s*$/, "").trim();
}

function extractUiAccounts(section: unknown): AccountFacts[] {
  const accounts: AccountFacts[] = [];
  let related = false;
  walk(section, (obj) => {
    if (lower(obj.type) === "heading") {
      const text = lower(obj.text);
      if (text.includes("unrelated")) related = false;
      else if (text.includes("related") && text.includes("complaint")) related = true;
    }
    const accountNumber = first14(obj.label);
    if (lower(obj.type) !== "accordion" || accountNumber.length < 8) return;
    const grid = rec(arr(obj.content).find((child) => lower(rec(child).type) === "grid") ?? {});
    const partyIds: string[] = [];
    for (const [key, value] of Object.entries(grid)) {
      if (/^party_id/i.test(key) && value != null) partyIds.push(str(value));
    }
    accounts.push({
      number: accountNumber,
      productName: productNameFromLabel(str(obj.label)),
      related,
      status: str(grid.account_status).toUpperCase(),
      opened: toIsoDate(grid.account_opened),
      role: str(grid.customer_role_on_the_product).toUpperCase(),
      productIndicators: lower(grid.product_indicators) === "none" ? "none" : str(grid.product_indicators),
      currentBalance: money(grid.current_balance),
      balanceAfterPending: money(grid.balance_after_pending_transactions),
      overdraftAmount: money(grid.overdraft_amount),
      finalAvailableBalance: money(grid.final_available_balance),
      partiesOnAccount: str(grid.parties_on_the_account),
      partyIds: uniqueSorted(partyIds),
    });
  });
  return accounts;
}

function extractUiSupportNeeds(section: unknown): SupportNeedFacts[] {
  if (!section || noneMessage(section, /no support needs/i)) return [];
  return listGroups(section).map((group) => {
    const row = groupRecord(group);
    return {
      description: str(row.heading).replace(/^support need:\s*/i, ""),
      lastChanged: toIsoDateTime(row.text),
      dateRecorded: toIsoDateTime(row.date_recorded),
      consentStatus: str(row.consent_status),
      nextReview: /ongoing/i.test(str(row.next_review)) ? "ongoing" : toIsoDate(row.next_review),
      furtherInformation: str(row.further_information),
    };
  }).filter((need) => need.description);
}

function extractUiRelatedParties(section: unknown): RelatedPartyFacts[] {
  if (!section || noneMessage(section, /no related parties/i)) return [];
  return listGroups(section).map((group) => {
    const row = groupRecord(group);
    return {
      relationship: str(row.relationship),
      relationshipCode: str(row.relationship_code),
      name: str(row.name),
      relatedPartyId: str(row.related_party_id),
      partyType: str(row.party_type).toUpperCase(),
    };
  }).filter((party) => party.relatedPartyId || party.name);
}

function extractUiContactNotes(section: unknown): ContactNoteFacts[] {
  if (!section || noneMessage(section, /no contact notes/i)) return [];
  return listGroups(section).map((group) => {
    const row = groupRecord(group);
    return {
      contactAt: toIsoDateTime(row["contact date"]),
      details: str(row["contact details"]),
      classification: str(row.classification),
      outcome: str(row.outcome),
      direction: str(row.direction),
      method: str(row.method),
      location: str(row.location),
      associatedCaseId: str(row.associated_case_id),
      brand: str(row.brand),
    };
  }).filter((note) => note.contactAt || note.details);
}

function extractUiCustomer(customer: unknown): CustomerFacts | null {
  const personal = accordionByLabel(customer, /personal details/i);
  let partyId = "";
  let name = "";
  let dateOfBirth = "";
  let age = "";
  let maritalStatus = "";
  let addressText = "";
  let addressTag = "";
  let timeWithBank = "";

  walk(personal, (obj) => {
    if (obj.party_id != null && !partyId) partyId = str(obj.party_id);
    if (obj.name != null && !name) name = str(obj.name);
    if (obj.date_of_birth != null && !dateOfBirth) dateOfBirth = str(obj.date_of_birth);
    if (obj.age != null && !age) age = str(obj.age);
    if (obj.marital_status != null && !maritalStatus) maritalStatus = str(obj.marital_status);
    if (obj.time_with_bank != null && !timeWithBank) timeWithBank = str(obj.time_with_bank);
    if (lower(obj.label).includes("residential address") && typeof obj.text === "string") {
      addressText = obj.text;
      addressTag = str(obj.tag);
    }
  });

  if (!partyId) return null;

  const parts = name.split(/\s+/).filter(Boolean);
  const title = /^(ms|mr|mrs|miss|mx|dr)$/i.test(parts[0] ?? "") ? parts[0] : "";
  const lastName = parts.length ? parts[parts.length - 1] : "";
  const firstName = parts.slice(title ? 1 : 0, -1).join(" ");
  const postcodeMatch = addressText.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i);
  const accounts = extractUiAccounts(accordionByLabel(customer, /accounts and products/i));

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
    addressTag,
    timeWithBank,
    relatedAccounts: uniqueSorted(accounts.filter((a) => a.related).map((a) => a.number)),
    unrelatedAccounts: uniqueSorted(accounts.filter((a) => !a.related).map((a) => a.number)),
    accounts,
    supportNeeds: extractUiSupportNeeds(accordionByLabel(customer, /support\s*needs/i)),
    relatedParties: extractUiRelatedParties(accordionByLabel(customer, /related parties/i)),
    contactNotes: extractUiContactNotes(accordionByLabel(customer, /contact notes/i)),
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

function addressTagShown(source: string, ui: string): boolean {
  if (!source) return !ui || /no recent change/i.test(ui);
  return collapse(ui).includes(collapse(source));
}

function tenureShown(source: string, ui: string): boolean {
  if (!source) return true;
  if (!ui) return false;
  if (collapse(source) === collapse(ui)) return true;
  const expected = parseTenure(source);
  const actual = parseTenure(ui);
  if (!expected || !actual) return collapse(ui).includes(collapse(source));
  const expectedMonths = expected.years * 12 + expected.months;
  const actualMonths = actual.years * 12 + actual.months;
  return Math.abs(expectedMonths - actualMonths) <= 1;
}

function productNameShown(source: string, ui: string): boolean {
  if (!source) return true;
  return collapse(ui).includes(collapse(source));
}

function detailsShown(source: string, ui: string): boolean {
  if (!source) return true;
  const expected = collapse(source);
  const actual = collapse(ui);
  return actual.includes(expected) || expected.includes(actual);
}

function pushField(
  failures: string[],
  prefix: string,
  field: string,
  sourceValue: string,
  uiValue: string,
  ok: boolean,
): void {
  if (ok) return;
  failures.push(`${prefix} ${field}: source "${sourceValue || "(empty)"}" adk "${uiValue || "(empty)"}"`);
}

function compareAccount(prefix: string, expected: AccountFacts, ui: AccountFacts, failures: string[]): void {
  const accountPrefix = `${prefix} account ${expected.number}`;
  pushField(failures, accountPrefix, "productName", expected.productName, ui.productName, productNameShown(expected.productName, ui.productName));
  if (expected.status && ui.status && expected.status !== ui.status) {
    pushField(failures, accountPrefix, "status", expected.status, ui.status, false);
  }
  if (expected.opened && ui.opened && expected.opened !== ui.opened) {
    pushField(failures, accountPrefix, "opened", expected.opened, ui.opened, false);
  }
  if (expected.role && ui.role && expected.role !== ui.role) {
    pushField(failures, accountPrefix, "role", expected.role, ui.role, false);
  }
  pushField(
    failures,
    accountPrefix,
    "productIndicators",
    expected.productIndicators,
    ui.productIndicators,
    !expected.productIndicators || lower(expected.productIndicators) === lower(ui.productIndicators),
  );
  pushField(failures, accountPrefix, "currentBalance", expected.currentBalance, ui.currentBalance, sameMoney(expected.currentBalance, ui.currentBalance));
  pushField(
    failures,
    accountPrefix,
    "balanceAfterPending",
    expected.balanceAfterPending,
    ui.balanceAfterPending,
    sameMoney(expected.balanceAfterPending, ui.balanceAfterPending),
  );
  pushField(failures, accountPrefix, "overdraftAmount", expected.overdraftAmount, ui.overdraftAmount, sameMoney(expected.overdraftAmount, ui.overdraftAmount));
  pushField(
    failures,
    accountPrefix,
    "finalAvailableBalance",
    expected.finalAvailableBalance,
    ui.finalAvailableBalance,
    sameMoney(expected.finalAvailableBalance, ui.finalAvailableBalance),
  );
  if (expected.partiesOnAccount && ui.partiesOnAccount && expected.partiesOnAccount !== ui.partiesOnAccount) {
    pushField(failures, accountPrefix, "partiesOnAccount", expected.partiesOnAccount, ui.partiesOnAccount, false);
  }
  if (ui.partyIds.length > 0 && !sameSet(expected.partyIds, ui.partyIds)) {
    failures.push(
      `${accountPrefix} parties: source ${expected.partyIds.join(", ")} adk ${ui.partyIds.join(", ")}`,
    );
  }
}

function compareSupportNeeds(prefix: string, expected: SupportNeedFacts[], ui: SupportNeedFacts[], failures: string[]): void {
  const sourceKeys = uniqueSorted(expected.map((need) => collapse(need.description)));
  const uiKeys = uniqueSorted(ui.map((need) => collapse(need.description)));
  if (!sameSet(sourceKeys, uiKeys)) {
    failures.push(
      `${prefix} supportNeeds: source [${expected.map((need) => need.description).join("; ")}] adk [${ui.map((need) => need.description).join("; ")}]`,
    );
    return;
  }
  for (const need of expected) {
    const match = ui.find((row) => collapse(row.description) === collapse(need.description));
    if (!match) continue;
    const needPrefix = `${prefix} supportNeed "${need.description}"`;
    pushField(failures, needPrefix, "lastChanged", need.lastChanged, match.lastChanged, sameMoment(need.lastChanged, match.lastChanged));
    pushField(failures, needPrefix, "dateRecorded", need.dateRecorded, match.dateRecorded, sameMoment(need.dateRecorded, match.dateRecorded));
    pushField(failures, needPrefix, "consentStatus", need.consentStatus, match.consentStatus, !need.consentStatus || collapse(need.consentStatus) === collapse(match.consentStatus));
    pushField(failures, needPrefix, "nextReview", need.nextReview, match.nextReview, sameMoment(need.nextReview, match.nextReview));
    pushField(
      failures,
      needPrefix,
      "furtherInformation",
      need.furtherInformation,
      match.furtherInformation,
      !need.furtherInformation || collapse(need.furtherInformation) === collapse(match.furtherInformation),
    );
  }
}

function compareRelatedParties(prefix: string, expected: RelatedPartyFacts[], ui: RelatedPartyFacts[], failures: string[]): void {
  const sourceKeys = uniqueSorted(expected.map((party) => party.relatedPartyId || collapse(party.name)));
  const uiKeys = uniqueSorted(ui.map((party) => party.relatedPartyId || collapse(party.name)));
  if (!sameSet(sourceKeys, uiKeys)) {
    failures.push(
      `${prefix} relatedParties: source [${sourceKeys.join("; ")}] adk [${uiKeys.join("; ")}]`,
    );
    return;
  }
  for (const party of expected) {
    const match = ui.find(
      (row) =>
        (party.relatedPartyId && row.relatedPartyId === party.relatedPartyId) ||
        collapse(row.name) === collapse(party.name),
    );
    if (!match) continue;
    const partyPrefix = `${prefix} relatedParty ${party.relatedPartyId || party.name}`;
    pushField(failures, partyPrefix, "relationship", party.relationship, match.relationship, !party.relationship || collapse(party.relationship) === collapse(match.relationship));
    pushField(failures, partyPrefix, "relationshipCode", party.relationshipCode, match.relationshipCode, !party.relationshipCode || party.relationshipCode === match.relationshipCode);
    pushField(failures, partyPrefix, "name", party.name, match.name, namePartsShown(party.name, match.name));
    pushField(failures, partyPrefix, "partyType", party.partyType, match.partyType, !party.partyType || party.partyType === match.partyType);
  }
}

function namePartsShown(source: string, ui: string): boolean {
  if (!source) return true;
  const shown = lower(ui);
  return source
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => shown.includes(lower(part)));
}

function compareContactNotes(prefix: string, expected: ContactNoteFacts[], ui: ContactNoteFacts[], failures: string[]): void {
  const sourceKeys = uniqueSorted(expected.map((note) => note.contactAt || collapse(note.details)));
  const uiKeys = uniqueSorted(ui.map((note) => note.contactAt || collapse(note.details)));
  if (!sameSet(sourceKeys, uiKeys)) {
    failures.push(
      `${prefix} contactNotes: source [${sourceKeys.join("; ")}] adk [${uiKeys.join("; ")}]`,
    );
    return;
  }
  for (const note of expected) {
    const match =
      ui.find((row) => row.contactAt === note.contactAt) ??
      ui.find((row) => collapse(row.details) === collapse(note.details));
    if (!match) continue;
    const notePrefix = `${prefix} contactNote ${note.contactAt || "(no date)"}`;
    pushField(failures, notePrefix, "details", note.details, match.details, detailsShown(note.details, match.details));
    pushField(failures, notePrefix, "classification", note.classification, match.classification, !note.classification || collapse(note.classification) === collapse(match.classification));
    pushField(failures, notePrefix, "outcome", note.outcome, match.outcome, !note.outcome || collapse(note.outcome) === collapse(match.outcome));
    pushField(failures, notePrefix, "direction", note.direction, match.direction, !note.direction || collapse(note.direction) === collapse(match.direction));
    pushField(failures, notePrefix, "method", note.method, match.method, !note.method || collapse(note.method) === collapse(match.method));
    pushField(failures, notePrefix, "location", note.location, match.location, !note.location || collapse(note.location) === collapse(match.location));
    pushField(failures, notePrefix, "associatedCaseId", note.associatedCaseId, match.associatedCaseId, !note.associatedCaseId || note.associatedCaseId === match.associatedCaseId);
    pushField(failures, notePrefix, "brand", note.brand, match.brand, !note.brand || collapse(note.brand) === collapse(match.brand));
  }
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
    pushField(failures, prefix, "dateOfBirth", expected.dateOfBirth, ui.dateOfBirth, !expected.dateOfBirth || expected.dateOfBirth === ui.dateOfBirth);
    pushField(failures, prefix, "age", expected.age, ui.age, !expected.age || expected.age === ui.age);
    pushField(failures, prefix, "maritalStatus", expected.maritalStatus, ui.maritalStatus, !expected.maritalStatus || expected.maritalStatus === ui.maritalStatus);
    if (!addressShown(expected, ui)) {
      failures.push(
        `${prefix} address: source ${[...expected.addressLines, expected.postcode].join(", ")} adk ${ui.addressLines.join(", ")}`,
      );
    }
    pushField(failures, prefix, "addressTag", expected.addressTag, ui.addressTag, addressTagShown(expected.addressTag, ui.addressTag));
    pushField(failures, prefix, "timeWithBank", expected.timeWithBank, ui.timeWithBank, tenureShown(expected.timeWithBank, ui.timeWithBank));

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
      compareAccount(prefix, expectedAccount, uiAccount, failures);
    }

    compareSupportNeeds(prefix, expected.supportNeeds, ui.supportNeeds, failures);
    compareRelatedParties(prefix, expected.relatedParties, ui.relatedParties, failures);
    compareContactNotes(prefix, expected.contactNotes, ui.contactNotes, failures);
  }

  assert.equal(failures.length, 0, `Fact-find mismatch:\n\n${failures.join("\n\n")}`);
}

export function assertComplaintsRules(aggregated: unknown, adk: unknown): void {
  compareFactFind(aggregated, adk);
}
