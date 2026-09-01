import type { Locator, Page } from "@playwright/test";
import type { NormalizedAccount, NormalizedCustomer } from "../core/models/normalized.js";
import {
  canonicalAddressFromText,
  canonicalAge,
  canonicalDuration,
  canonicalEmptyOrList,
  canonicalIsoDate,
  canonicalNameFromDisplay,
  canonicalPartyId,
  canonicalStatus,
} from "../core/normalization/index.js";

export interface ExtractedPersonalDetails {
  name: string;
  dateOfBirth: string;
  age: string;
  maritalStatus: string;
  address: string;
  partyId: string;
  timeWithBank: string;
}

interface ArticleSnapshot {
  fields: Record<string, string>;
  sections: string[];
  contactNotes: string;
  supportNeeds: string;
  relatedParties: string;
  accounts: Array<{
    label: string;
    relationship: "related" | "unrelated";
    fields: Record<string, string>;
  }>;
}

export class CustomerSection {
  constructor(
    private readonly page: Page,
    private readonly root?: Locator,
  ) {}

  async snapshotArticle(): Promise<ArticleSnapshot> {
    // String script so tsx/esbuild cannot inject __name into the browser context.
    const script = new Function(
      "article",
      `var LABEL_ALIASES = {
          "Party ID": "Party id",
          "Party Id": "Party id",
          "PartyID": "Party id",
          "DOB": "Date of birth",
          "Date of Birth": "Date of birth",
          "Marital Status": "Marital status",
          "Time with Bank": "Time with bank",
          "Residential Address": "Residential address"
        };
        var KNOWN_LABELS = {
          "Name": 1,
          "Date of birth": 1,
          "Age": 1,
          "Marital status": 1,
          "Residential address": 1,
          "Party id": 1,
          "Time with bank": 1,
          "Account status": 1,
          "Account opened": 1,
          "Current balance": 1,
          "Balance after pending transactions": 1,
          "Overdraft amount": 1,
          "Final available balance": 1,
          "Customer role on the product": 1,
          "Product indicators": 1
        };
        var canonLabel = function(key) {
          var trimmed = (key || "").replace(/:$/, "").trim();
          return LABEL_ALIASES[trimmed] || trimmed;
        };
        var fieldMap = function(root) {
          var fields = {};
          root.querySelectorAll("dt").forEach(function(dt) {
            var key = canonLabel((dt.textContent || "").trim());
            var dd = dt.nextElementSibling;
            if (key && dd) fields[key] = (dd.textContent || "").trim();
          });
          if (Object.keys(fields).length) return fields;
          var lines = (root.innerText || "").split(/\\n+/).map(function(s) { return s.trim(); }).filter(Boolean);
          for (var i = 0; i < lines.length - 1; i++) {
            var label = canonLabel(lines[i]);
            if (KNOWN_LABELS[label] && !KNOWN_LABELS[canonLabel(lines[i + 1])]) {
              fields[label] = lines[i + 1];
            }
          }
          return fields;
        };
        var sectionText = function(title) {
          var details = Array.prototype.slice.call(article.querySelectorAll("details")).find(function(d) {
            var summary = d.querySelector(":scope > summary");
            return (summary && summary.textContent || "").trim().toLowerCase().indexOf(title.toLowerCase()) === 0;
          });
          return (details && details.querySelector("p") && details.querySelector("p").textContent || "").trim();
        };
        var accounts = [];
        article.querySelectorAll("details").forEach(function(d) {
          var label = ((d.querySelector(":scope > summary") && d.querySelector(":scope > summary").textContent) || "").trim();
          if (!/\\d{10,}$/.test(label)) return;
          var relationship = "unrelated";
          var prev = d.previousElementSibling;
          while (prev) {
            if (prev.tagName === "H3") {
              var t = (prev.textContent || "").toLowerCase();
              if (t.indexOf("unrelated") >= 0) relationship = "unrelated";
              else if (t.indexOf("related") >= 0) relationship = "related";
              break;
            }
            prev = prev.previousElementSibling;
          }
          accounts.push({ label: label, relationship: relationship, fields: fieldMap(d) });
        });
        return {
          fields: fieldMap(article),
          sections: (function() {
            var fromDetails = Array.prototype.slice.call(article.querySelectorAll("details > summary")).map(function(s) {
              return (s.textContent || "").trim();
            }).filter(Boolean);
            if (fromDetails.length) return fromDetails;
            var names = ["Personal details", "Accounts and products", "Contact notes", "Support needs", "Related parties"];
            var text = (article.innerText || "").toLowerCase();
            return names.filter(function(n) { return text.indexOf(n.toLowerCase()) >= 0; });
          })(),
          contactNotes: sectionText("Contact notes"),
          supportNeeds: sectionText("Support needs"),
          relatedParties: sectionText("Related parties"),
          accounts: accounts
        };`,
    );
    const target = this.root ?? this.page.getByRole("article");
    return target.evaluate(script as (article: unknown) => ArticleSnapshot);
  }

  async getPersonalDetails(_customerIdentifier: string): Promise<ExtractedPersonalDetails> {
    const snap = await this.snapshotArticle();
    return {
      name: snap.fields.Name ?? "",
      dateOfBirth: snap.fields["Date of birth"] ?? "",
      age: snap.fields.Age ?? "",
      maritalStatus: snap.fields["Marital status"] ?? "",
      address: snap.fields["Residential address"] ?? "",
      partyId: canonicalPartyId(snap.fields["Party id"] ?? ""),
      timeWithBank: snap.fields["Time with bank"] ?? "",
    };
  }

  async getContactNotes(_customerIdentifier: string): Promise<string[]> {
    const snap = await this.snapshotArticle();
    return snap.contactNotes ? [snap.contactNotes] : [];
  }

  async getSupportNeeds(_customerIdentifier: string): Promise<string[]> {
    const snap = await this.snapshotArticle();
    return snap.supportNeeds ? [snap.supportNeeds] : [];
  }

  async getRelatedParties(_customerIdentifier: string): Promise<string[]> {
    const snap = await this.snapshotArticle();
    return snap.relatedParties ? [snap.relatedParties] : [];
  }

  toNormalized(
    tabName: string,
    personal: ExtractedPersonalDetails,
    accounts: NormalizedAccount[],
    extras: { contactNotes: string[]; supportNeeds: string[]; relatedParties: string[] },
  ): NormalizedCustomer {
    const name = canonicalNameFromDisplay(personal.name || tabName);
    return {
      partyId: canonicalPartyId(personal.partyId),
      name,
      dateOfBirth: canonicalIsoDate(personal.dateOfBirth),
      age: canonicalAge(personal.age),
      maritalStatus: canonicalStatus(personal.maritalStatus),
      address: canonicalAddressFromText(personal.address),
      timeWithBank: canonicalDuration(personal.timeWithBank),
      accounts,
      contactNotes: canonicalEmptyOrList(extras.contactNotes),
      supportNeeds: canonicalEmptyOrList(extras.supportNeeds),
      relatedParties: canonicalEmptyOrList(extras.relatedParties),
      sections: [
        "Personal details",
        "Accounts and products",
        "Contact notes",
        "Support needs",
        "Related parties",
      ],
      sourcePath: `rendered.tab[${name.display || tabName}]`,
    };
  }
}
