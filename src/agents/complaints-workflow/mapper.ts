import { parseAdkContract } from "../../core/parser/adk-contract-parser.js";
import type { ParsedAgentContract, UIComponent } from "../../core/models/ui-component.js";
import type { NormalizedAccount, NormalizedContractModel, NormalizedCustomer } from "../../core/models/normalized.js";
import {
  canonicalAccountNumber,
  canonicalAddressFromText,
  canonicalAge,
  canonicalDuration,
  canonicalEmptyOrList,
  canonicalIndicators,
  canonicalIsoDate,
  canonicalMoneyMinor,
  canonicalNameFromDisplay,
  canonicalPartyId,
  canonicalStatus,
} from "../../core/normalization/index.js";
import type { ContractMutation } from "../../core/models/context.js";

function rec(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function applyMutation(raw: Record<string, unknown>, mutation?: ContractMutation): Record<string, unknown> {
  if (!mutation) return raw;
  const factFind = rec(raw.fact_find);
  let customers = arr(factFind.customers);

  if (mutation.dropCustomerPartyId) {
    customers = customers.filter((c, i) => extractPartyId(rec(c), i) !== mutation.dropCustomerPartyId);
  }

  if (mutation.overrideDob) {
    customers = customers.map((c, i) => {
      const partyId = extractPartyId(rec(c), i);
      if (partyId !== mutation.overrideDob?.partyId) return c;
      return overrideGridField(rec(c), "date_of_birth", mutation.overrideDob.dateOfBirth);
    });
  }

  if (mutation.dropAccountNumber) {
    customers = customers.map((c) => dropAccount(rec(c), mutation.dropAccountNumber!));
  }

  if (mutation.duplicateAccountNumber) {
    customers = customers.map((c) => duplicateAccount(rec(c), mutation.duplicateAccountNumber!));
  }

  if (mutation.overrideBalance) {
    customers = customers.map((c) =>
      overrideAccountGridField(
        rec(c),
        mutation.overrideBalance!.accountNumber,
        "current_balance",
        mutation.overrideBalance!.currentBalance,
      ),
    );
  }

  if (mutation.dropSectionLabel) {
    customers = customers.map((c) => dropSection(rec(c), mutation.dropSectionLabel!));
  }

  return {
    ...raw,
    fact_find: { ...factFind, customers },
  };
}

function extractPartyId(customer: Record<string, unknown>, index: number): string {
  const sections = arr(customer.sections);
  for (const section of sections) {
    for (const node of arr(rec(section).content)) {
      const n = rec(node);
      if (n.party_id != null) return canonicalPartyId(n.party_id);
    }
  }
  return `unknown-${index}`;
}

function mapContent(customer: Record<string, unknown>, mapper: (node: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  const sections = arr(customer.sections).map((section) => {
    const s = rec(section);
    return {
      ...s,
      content: deepMapNodes(arr(s.content), mapper),
    };
  });
  return { ...customer, sections };
}

function deepMapNodes(
  nodes: unknown[],
  mapper: (node: Record<string, unknown>) => Record<string, unknown>,
): unknown[] {
  return nodes.map((node) => {
    const n = rec(node);
    const mapped = mapper(n);
    const next: Record<string, unknown> = { ...mapped };
    if (Array.isArray(mapped.content)) {
      next.content = deepMapNodes(arr(mapped.content), mapper);
    }
    if (Array.isArray(mapped.items)) {
      next.items = arr(mapped.items).map((group) =>
        Array.isArray(group) ? deepMapNodes(group, mapper) : mapper(rec(group)),
      );
    }
    return next;
  });
}

function overrideGridField(
  customer: Record<string, unknown>,
  field: string,
  value: string,
): Record<string, unknown> {
  return mapContent(customer, (node) => {
    if (String(node.type).toLowerCase() === "grid" && field in node) {
      return { ...node, [field]: value };
    }
    return node;
  });
}

function dropAccount(customer: Record<string, unknown>, accountNumber: string): Record<string, unknown> {
  const want = canonicalAccountNumber(accountNumber);
  return mapContent(customer, (node) => {
    if (String(node.type).toLowerCase() === "list" && Array.isArray(node.items)) {
      const items = arr(node.items)
        .map((group) => {
          if (!Array.isArray(group)) return group;
          return group.filter((item) => {
            const label = String(rec(item).label ?? "");
            return canonicalAccountNumber(label) !== want;
          });
        })
        .filter((group) => !Array.isArray(group) || group.length > 0);
      return { ...node, items };
    }
    return node;
  });
}

function duplicateAccount(customer: Record<string, unknown>, accountNumber: string): Record<string, unknown> {
  const want = canonicalAccountNumber(accountNumber);
  return mapContent(customer, (node) => {
    if (String(node.type).toLowerCase() === "list" && Array.isArray(node.items)) {
      const items: unknown[] = [];
      for (const group of arr(node.items)) {
        items.push(group);
        if (Array.isArray(group)) {
          const match = group.find((item) => canonicalAccountNumber(rec(item).label) === want);
          if (match) items.push(group);
        }
      }
      return { ...node, items };
    }
    return node;
  });
}

function overrideAccountGridField(
  customer: Record<string, unknown>,
  accountNumber: string,
  field: string,
  value: string,
): Record<string, unknown> {
  const want = canonicalAccountNumber(accountNumber);
  return mapContent(customer, (node) => {
    if (String(node.type).toLowerCase() === "accordion" && canonicalAccountNumber(node.label) === want) {
      const content = arr(node.content).map((child) => {
        const c = rec(child);
        if (String(c.type).toLowerCase() === "grid") {
          return { ...c, [field]: value };
        }
        return c;
      });
      return { ...node, content };
    }
    return node;
  });
}

function dropSection(customer: Record<string, unknown>, label: string): Record<string, unknown> {
  const want = label.toLowerCase();
  return {
    ...customer,
    sections: arr(customer.sections).filter((s) => String(rec(s).label ?? "").toLowerCase() !== want),
  };
}

function parseAccountLabel(label: string): { accountName: string; accountNumber: string } {
  const m = label.trim().match(/^(.*?)\s+(\d{8,})$/);
  if (!m) return { accountName: label.trim(), accountNumber: canonicalAccountNumber(label) };
  return { accountName: m[1].trim(), accountNumber: canonicalAccountNumber(m[2]) };
}

function extractAccountsFromSection(section: Record<string, unknown>, customerPath: string): NormalizedAccount[] {
  const accounts: NormalizedAccount[] = [];
  let relationship: "related" | "unrelated" = "unrelated";
  const content = arr(section.content);

  const visitAccordion = (acc: Record<string, unknown>, path: string) => {
    const label = String(acc.label ?? "");
    const parsed = parseAccountLabel(label);
    const grid = arr(acc.content).find((n) => String(rec(n).type).toLowerCase() === "grid");
    const g = rec(grid);
    const partyIds: string[] = [];
    for (const [k, v] of Object.entries(g)) {
      if (/^party_id[_ ]?\d+$/i.test(k.replace(/\s/g, "_"))) {
        partyIds.push(canonicalPartyId(v));
      }
    }
    accounts.push({
      accountNumber: parsed.accountNumber,
      accountName: parsed.accountName,
      status: canonicalStatus(g.account_status),
      openedDate: canonicalIsoDate(g.account_opened),
      currentBalanceMinor: canonicalMoneyMinor(g.current_balance),
      pendingBalanceMinor: canonicalMoneyMinor(g.balance_after_pending_transactions),
      overdraftMinor: canonicalMoneyMinor(g.overdraft_amount),
      finalAvailableMinor: canonicalMoneyMinor(g.final_available_balance),
      customerRole: canonicalStatus(g.customer_role_on_the_product),
      partyIds: partyIds.sort(),
      relationshipToComplaint: relationship,
      productIndicators: canonicalIndicators(g.product_indicators),
      sourcePath: path,
    });
  };

  const visit = (nodes: unknown[], basePath: string) => {
    nodes.forEach((node, i) => {
      const n = rec(node);
      const type = String(n.type ?? "").toLowerCase();
      const path = `${basePath}[${i}]`;
      if (type === "heading") {
        const t = String(n.text ?? "").toLowerCase();
        if (t.includes("unrelated")) relationship = "unrelated";
        else if (t.includes("related to complaint")) relationship = "related";
      }
      if (type === "accordion" && n.label) {
        visitAccordion(n, path);
      }
      if (type === "list") {
        arr(n.items).forEach((group, gi) => {
          const gpath = `${path}.items[${gi}]`;
          if (Array.isArray(group)) visit(group, gpath);
          else visit([group], gpath);
        });
      }
      if (Array.isArray(n.content) && type !== "accordion") {
        visit(arr(n.content), `${path}.content`);
      }
    });
  };

  visit(content, `${customerPath}.accounts`);
  return accounts;
}

function extractCustomer(raw: Record<string, unknown>, index: number): NormalizedCustomer {
  const path = `fact_find.customers[${index}]`;
  const sections = arr(raw.sections);
  const sectionByLabel = (label: string) =>
    sections.find((s) => String(rec(s).label ?? "").toLowerCase() === label.toLowerCase());

  const personal = rec(sectionByLabel("Personal details"));
  const personalContent = arr(personal.content);
  const grids = personalContent.filter((n) => String(rec(n).type).toLowerCase() === "grid").map(rec);
  const identity = grids[0] ?? {};
  const partyGrid = grids.find((g) => g.party_id != null) ?? {};
  const addressBlock = rec(personalContent.find((n) => String(rec(n).type).toLowerCase() === "block"));

  const notesSection = rec(sectionByLabel("Contact notes"));
  const supportSection = rec(sectionByLabel("Support needs"));
  const relatedSection = rec(sectionByLabel("Related parties"));
  const accountsSection = rec(sectionByLabel("Accounts and products"));

  const noteText = String(rec(arr(notesSection.content)[0]).text ?? "");
  const supportText = String(rec(arr(supportSection.content)[0]).text ?? "");
  const relatedText = String(rec(arr(relatedSection.content)[0]).text ?? "");

  const labels = sections.map((s) => String(rec(s).label ?? "")).filter(Boolean);

  return {
    partyId: canonicalPartyId(partyGrid.party_id),
    name: canonicalNameFromDisplay(identity.name),
    dateOfBirth: canonicalIsoDate(identity.date_of_birth),
    age: canonicalAge(identity.age),
    maritalStatus: canonicalStatus(identity.marital_status),
    address: canonicalAddressFromText(addressBlock.text),
    timeWithBank: canonicalDuration(partyGrid.time_with_bank),
    accounts: extractAccountsFromSection(accountsSection, path),
    contactNotes: canonicalEmptyOrList(noteText),
    supportNeeds: canonicalEmptyOrList(supportText),
    relatedParties: canonicalEmptyOrList(relatedText),
    sections: labels,
    sourcePath: path,
  };
}

export function mapComplaintsContract(
  input: unknown,
  mutation?: ContractMutation,
): { parsed: ParsedAgentContract; model: NormalizedContractModel } {
  const parsed = parseAdkContract(input);
  const mutatedRaw = applyMutation(parsed.raw, mutation);
  const reparsed = mutation ? parseAdkContract(mutatedRaw) : parsed;

  const summary = rec(reparsed.raw.summaryBox ?? reparsed.raw.summarybox);
  const groundedness = rec(reparsed.raw.groundednessCheck);
  const analysis = rec(reparsed.raw.analysis);
  const factFind = rec(reparsed.raw.fact_find);
  const customers = arr(factFind.customers).map((c, i) => extractCustomer(rec(c), i));

  const summaryContent = arr(summary.content);
  const summaryHeadings = summaryContent
    .filter((n) => String(rec(n).type).toLowerCase() === "heading")
    .map((n) => String(rec(n).text ?? ""));
  const summaryTexts = summaryContent
    .filter((n) => String(rec(n).type).toLowerCase() === "text")
    .map((n) => String(rec(n).text ?? ""));

  const analysisSectionLabels = arr(analysis.sections).map((s) => String(rec(s).label ?? "")).filter(Boolean);

  const model: NormalizedContractModel = {
    complaintRef: summary.complaintReference != null ? String(summary.complaintReference) : undefined,
    groundedness: {
      status: String(groundedness.status ?? ""),
      message: groundedness.message != null ? String(groundedness.message) : undefined,
    },
    summaryHeadings,
    summaryTexts,
    analysisSectionLabels,
    customers,
    tree: reparsed.tree,
  };

  return { parsed: reparsed, model };
}

export function findAccordion(nodes: UIComponent[], label: string): UIComponent | undefined {
  const want = label.toLowerCase();
  for (const node of nodes) {
    if (node.type === "accordion" && (node.label ?? "").toLowerCase() === want) return node;
    const nested = findAccordion(node.children, label);
    if (nested) return nested;
  }
  return undefined;
}
