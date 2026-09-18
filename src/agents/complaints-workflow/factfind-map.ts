import type { UiLocator } from "./json-get.js";

/**
 * The Fact Find compare contract: one row per screenshot field — left side
 * aggregated JSON, right side the A2UI tree, plus how the two are matched.
 *
 * Adding a field is one row here. Nothing in compare-map.ts knows field names.
 * Live chat and card freeze are out of contract and so are not listed.
 */

/** How a pair of values is judged. The runner dispatches on this, never on the field name. */
export type MatchName = "equal" | "date" | "money" | "contains" | "tenure" | "set" | "boolean";

export type TransformName =
  | "first14"
  | "accountNumbers"
  | "unrelatedAccountNumbers"
  | "count"
  | "join"
  | "indicatorsOrNone"
  | "reviewOrOngoing"
  | "relatedPartyName"
  | "stripSupportNeedPrefix"
  | "words";

/** A bare path, every path concatenated, or the first path that holds a value. */
export type SourceSpec =
  | string
  | { paths?: string[]; firstOf?: string[]; transform?: TransformName };

export type UiSpec = { at: UiLocator; transform?: TransformName };

export type FieldRule = {
  field: string;
  source: SourceSpec;
  ui: UiSpec;
  match: MatchName;
  /**
   * Skip when the UI omits the field: balance rows absent from older traces, and
   * the fields the tree does not render yet (see `notRendered` rows below).
   */
  optional?: boolean;
};

export type CollectionRule = {
  name: string;
  /** Path to the source rows, plus any parent values a row needs. */
  source: { path: string; with?: Record<string, string> };
  ui: UiSpec;
  /** Identity. Its match decides how rows are keyed: date ids by moment, else by text. */
  id: FieldRule;
  fields: FieldRule[];
};

/** Source paths for one customer scope key. `whereId` keeps rows for this party only. */
export type ScopeSpec = { firstOf: string[]; whereId?: string };

/**
 * Judged once per run against the two file roots rather than per customer, so
 * both sides are plain paths: the trace's reference sits on its envelope, outside
 * the fact_find tree.
 */
export type RootRule = { field: string; source: SourceSpec; ui: SourceSpec; match: MatchName };

export type FactFindMap = {
  source: { partyIds: SourceSpec; customer: Record<string, ScopeSpec> };
  ui: { customers: string; partyId: UiLocator };
  root: RootRule[];
  fields: FieldRule[];
  collections: CollectionRule[];
};

/** Locator shorthands. `at: key(...)` is relative to the row the runner is on. */
const key = (name: string): UiLocator => ({ key: name });
const personal = (name: string): UiLocator => ({ accordion: "Personal details", key: name });
const residential = (name: string): UiLocator => ({
  accordion: "Personal details",
  label: "Residential address",
  key: name,
});
const block = (label: string): UiLocator => ({ label, key: "text" });
const accounts = (which: boolean | "related" | "unrelated"): UiLocator => ({
  accordion: "Accounts and products",
  accounts: which,
});

const holding = "sources.customerHolding.customerHoldingsByParty.{id}";
const balance = "accountDetails.{id}.details.balance";

export const factFindMap: FactFindMap = {
  source: {
    partyIds: {
      firstOf: [
        "derived.customerFlowPartyIds",
        "derived.resolvedPartyIds",
        "sources.ica.customers[*].customerOCISID",
      ],
    },
    customer: {
      party: { firstOf: [`${holding}.party`] },
      products: { firstOf: [`${holding}.product`] },
      accountDetails: { firstOf: ["sources.accountDetails"] },
      icaAccounts: {
        firstOf: ["sources.ica.items[*].accountNumberFull", "sources.ica.items[*].accountNumber"],
      },
      notes: {
        firstOf: ["sources.contactNotesByParty.{id}.notes", "sources.contactNotes"],
        whereId: "partyId",
      },
    },
  },

  ui: { customers: "fact_find.customers", partyId: personal("party_id") },

  // The cheapest guard there is: a payload paired with another ref's trace.
  root: [{ field: "complaintRef", source: "complaintRef", ui: "complaintRef", match: "equal" }],

  fields: [
    // Personal details
    { field: "name", source: { paths: ["party.title", "party.foreName", "party.lastName"] }, ui: { at: personal("name") }, match: "contains" },
    { field: "dateOfBirth", source: "party.dateOfBirth", ui: { at: personal("date_of_birth") }, match: "date" },
    { field: "age", source: "party.age", ui: { at: personal("age") }, match: "equal" },
    { field: "maritalStatus", source: "party.maritalStatus", ui: { at: personal("marital_status") }, match: "equal" },
    { field: "address", source: { paths: ["party.address.addressLines[*]", "party.address.postcode"] }, ui: { at: residential("text") }, match: "contains" },
    // Source silent about a move; the UI may still say "No Recent Change of Address".
    { field: "addressTag", source: "party.addressNotifications[0].notificationText", ui: { at: residential("tag") }, match: "contains" },
    { field: "partyId", source: "party.partyId", ui: { at: personal("party_id") }, match: "equal" },
    { field: "timeWithBank", source: "party.timeWithBank", ui: { at: personal("time_with_bank") }, match: "tenure" },

    // The source carries these but the tree does not render them, so they skip
    // until it does. Keys and matches are provisional: confirm when the UI lands.
    { field: "gender", source: "party.gender", ui: { at: personal("gender") }, match: "equal", optional: true },
    { field: "dateOfDeath", source: "party.dateOfDeath", ui: { at: personal("date_of_death") }, match: "date", optional: true },
    { field: "supportRequired", source: "party.partyIndicator.supportRequired", ui: { at: personal("support_required") }, match: "boolean", optional: true },

    // Accounts and products: the complaint's accounts sit under the "related" heading.
    { field: "relatedAccounts", source: { paths: ["icaAccounts"], transform: "accountNumbers" }, ui: { at: { ...accounts("related"), key: "label" }, transform: "first14" }, match: "set" },
    { field: "unrelatedAccounts", source: { paths: ["products[*].accountNumber", "icaAccounts"], transform: "unrelatedAccountNumbers" }, ui: { at: { ...accounts("unrelated"), key: "label" }, transform: "first14" }, match: "set" },
  ],

  collections: [
    {
      // Every holding, related or not, paired with the UI accordion by account number.
      name: "accounts",
      source: { path: "products", with: { accountDetails: "accountDetails" } },
      ui: { at: accounts(true) },
      id: { field: "number", source: { paths: ["accountNumber"], transform: "first14" }, ui: { at: key("label"), transform: "first14" }, match: "equal" },
      fields: [
        { field: "productName", source: "accountName", ui: { at: key("label") }, match: "contains" },
        { field: "status", source: "accountStatus", ui: { at: key("account_status") }, match: "equal", optional: true },
        { field: "opened", source: "accountOpenedDate", ui: { at: key("account_opened") }, match: "date", optional: true },
        { field: "role", source: "productHeldRoleType", ui: { at: key("customer_role_on_the_product") }, match: "equal", optional: true },
        // Not rendered yet, as above.
        { field: "productType", source: { paths: ["productType"], transform: "words" }, ui: { at: key("product_type") }, match: "equal", optional: true },
        { field: "productGroup", source: { firstOf: ["productGroupDescription", "productGroup"] }, ui: { at: key("product_group") }, match: "equal", optional: true },
        { field: "closed", source: "accountClosedDate", ui: { at: key("account_closed") }, match: "date", optional: true },
        { field: "productIndicators", source: { paths: ["accountDetails.{id}.details.indicators"], transform: "indicatorsOrNone" }, ui: { at: key("product_indicators") }, match: "equal" },
        { field: "currentBalance", source: { firstOf: [`${balance}.currentBalance`, `${balance}.interimBookedBalance`] }, ui: { at: key("current_balance") }, match: "money" },
        { field: "balanceAfterPending", source: `${balance}.interimAvailableWithCreditBalance`, ui: { at: key("balance_after_pending_transactions") }, match: "money" },
        { field: "overdraftAmount", source: `${balance}.overdraftAmount`, ui: { at: key("overdraft_amount") }, match: "money" },
        { field: "finalAvailableBalance", source: `${balance}.interimAvailableBalance`, ui: { at: key("final_available_balance") }, match: "money" },
        { field: "partiesOnAccount", source: { paths: ["partyList"], transform: "count" }, ui: { at: key("parties_on_the_account") }, match: "equal", optional: true },
        { field: "partyIds", source: "partyList[*].partyId", ui: { at: { keys: /^party_id/i } }, match: "set", optional: true },
      ],
    },

    {
      // party.relatedPartyList, never Trusted Parties: that API 404s on NC10010556.
      name: "relatedParties",
      source: { path: "party.relatedPartyList", with: { relationshipNotifications: "party.relationshipNotifications" } },
      ui: { at: { accordion: "Related parties", list: true, empty: /no related parties/i } },
      id: { field: "relatedPartyId", source: "relatedPartyId", ui: { at: key("related_party_id") }, match: "equal" },
      fields: [
        { field: "relationship", source: { firstOf: ["relationshipDescription", "relationship"] }, ui: { at: key("relationship") }, match: "equal" },
        { field: "relationshipCode", source: { firstOf: ["relatedPartyRelationshipCode", "relationshipCode"] }, ui: { at: key("relationship_code") }, match: "equal" },
        { field: "name", source: { paths: ["relationshipNotifications[*].notificationText", "relationshipDescription", "name", "relatedPartyName"], transform: "relatedPartyName" }, ui: { at: key("name") }, match: "contains" },
        { field: "partyType", source: { firstOf: ["relatedPartyType", "partyType"] }, ui: { at: key("party_type") }, match: "equal" },
      ],
    },

    {
      // Identity is the notification heading. The row's own text reads "Last changed: ...".
      name: "supportNeeds",
      source: { path: "party.partyIndicator.supportNeeds" },
      ui: { at: { accordion: "Support needs", list: true, empty: /no support needs/i } },
      id: { field: "description", source: { firstOf: ["description", "need", "type"] }, ui: { at: key("heading"), transform: "stripSupportNeedPrefix" }, match: "equal" },
      fields: [
        { field: "lastChanged", source: { firstOf: ["dateEdited", "lastChanged"] }, ui: { at: key("text") }, match: "date" },
        { field: "dateRecorded", source: "dateRecorded", ui: { at: key("date_recorded") }, match: "date" },
        { field: "consentStatus", source: "consentStatus", ui: { at: key("consent_status") }, match: "equal" },
        { field: "nextReview", source: { firstOf: ["dateForReview", "nextReview"], transform: "reviewOrOngoing" }, ui: { at: key("next_review") }, match: "date" },
        { field: "furtherInformation", source: "furtherInformation", ui: { at: key("further_information") }, match: "equal" },
      ],
    },

    {
      // The blocks are labelled; a row's bare texts interleave the date and the details.
      name: "contactNotes",
      source: { path: "notes" },
      ui: { at: { accordion: "Contact Notes", list: true, empty: /no contact notes/i } },
      id: { field: "contactAt", source: { paths: ["contactDate", "contactTime"], transform: "join" }, ui: { at: block("Contact date") }, match: "date" },
      fields: [
        { field: "details", source: { firstOf: ["interactionText", "contactDetails"] }, ui: { at: block("Contact details") }, match: "contains" },
        { field: "classification", source: { firstOf: ["classificationCodeNarrative", "classification"] }, ui: { at: key("classification") }, match: "equal" },
        { field: "outcome", source: { firstOf: ["outcomeCodeNarrative", "outcome"] }, ui: { at: key("outcome") }, match: "equal" },
        { field: "direction", source: { firstOf: ["directionCodeNarrative", "direction"] }, ui: { at: key("direction") }, match: "equal" },
        { field: "method", source: { firstOf: ["contactMediumCodeNarrative", "method"] }, ui: { at: key("method") }, match: "equal" },
        { field: "location", source: { firstOf: ["locationCodeNarrative", "location"] }, ui: { at: key("location") }, match: "equal" },
        { field: "associatedCaseId", source: { firstOf: ["caseId", "associatedCaseId"] }, ui: { at: key("associated_case_id") }, match: "equal" },
        { field: "brand", source: { firstOf: ["companyCodeNarrative", "brand"] }, ui: { at: key("brand") }, match: "equal" },
      ],
    },
  ],
};
