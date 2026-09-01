# Complaints Workflow Agent — UI Validation Framework

**Implementation brief for Cursor.**
Read this whole document first. **Do not write code until you have produced the architecture proposal (Section 12) and I have approved it.** Then implement in the milestones defined in Section 11, in order, stopping after each.

---

## 0. TL;DR for the implementer

We are validating an AI agent that renders a **dynamic UI** from a structured component spec. The old approach (Playwright + hardcoded selectors + POM) is dead because the DOM is now unstable and machine-generated.

The key insight that shapes everything below:

> The agent's response already contains a **fully serializable component spec** (`agentOutput`). The UI is a deterministic function of that spec. So the spec — not the DOM — is the primary system under test.

Therefore the framework has a **trust hierarchy**, not a flat set of equal layers:

1. **Primary, always-on, CI-gating, no browser:** validate `ground truth (source payload)` against `ADK contract (agent spec)`. Pure JSON-to-JSON. Unbreakable by rendering changes. This is where the value is.
2. **Secondary, optional, non-gating:** validate that the rendered UI faithfully reflects the spec. Because the DOM is unreliable, this layer **degrades to a visual snapshot** rather than depending on structural locators.
3. **Tertiary, optional, bounded:** LLM semantic check for free-text faithfulness only. Never source of truth. Fails closed.

Build layer 1 completely before touching a browser.

---

## 1. Naming and ground rules (read carefully — corrects the source prompt)

- The agent is the **Complaints Workflow Agent**. The route is `/agent/complaints_workflow`. Use `complaints-workflow` as the config/adapter key everywhere. (Do **not** use "Compliance Workflow".)
- The spec uses two type spellings: top-level **`summaryBox`** and, inside `analysis`, a node type **`summarybox`**. These are the same concept at different nesting. **All component-type matching must be case-insensitive.** Do not treat them as two unrelated types.
- **Do not invent ADK response shapes.** The only authoritative shape is the supplied `adk_NC10010449.json` (`agentOutput` is a JSON *string* that must be `JSON.parse`d). If a field isn't in the sample, treat it as an assumption and document it.
- **Do not build "an AI that tests an AI."** The LLM is a bounded, optional, fail-closed helper for free-text semantics only.
- **Do not replace Playwright**, but **do not let the DOM be the source of business truth** either. See the trust hierarchy above.

---

## 2. The real data (this is your contract — build to it, not to guesses)

Two files per complaint:

### A. Source / ground-truth payload — `NC10010449.json`
```
complaintRef
generatedAt
derived
  primaryPartyId            "46142591"
  resolvedPartyIds          ["46142591", "1420289780"]
  customerFlowPartyIds      ["46142591", "1420289780"]
  ...skip flags, failed-id lists...
sources
  ica
    header { caseReference, caseStatusDescr, caseBrandDescr, ... }
    customers[2]            (ICA customer records: title, first/last name, address...)
  accountDetails
    <accountNumber> { statusCode, details{...}, errors{...} }   # 4 accounts
  customerHolding.customerHoldingsByParty { <partyId>: {...} }
  contactNotes[]  /  contactNotesByParty { <partyId>: { notes[], error } }
  trustedParties[] / trustedPartiesByParty { <partyId>: { trustedParties[], error } }
```

### B. ADK agent response — `adk_NC10010449.json`
```
complaintRef, sessionId, capturedAt
agentOutput        <-- JSON STRING. JSON.parse it. This is the UI contract.
raw_events[21]     <-- ADK invocation trace (author, actions, id, timestamp). Secondary evidence.
```

`JSON.parse(agentOutput)` yields the **four render blocks**:

```
summaryBox          { complaintReference, mode, variation, content[39] }
                    content items: { type: "heading"|"text", text, className }
groundednessCheck   { status: "correct", message }         <-- FREE agent-quality gate
analysis            { sections[3] }  each: { type:"accordion", label, defaultOpen, content:[{type:"summarybox", variant, title, content}] }
fact_find           { customers[2] } each: { sections[5] }
```

Each `fact_find.customers[].sections[]` is an **accordion** with these labels, in order:
`Personal details`, `Accounts and products`, `Contact notes`, `Support needs`, `Related parties`.

Node vocabulary actually present (case-insensitively):
`accordion`, `grid`, `block`, `divider`, `list`, `heading`, `text`, `summarybox`/`summaryBox`.

- `grid` = a flat key→value bag (e.g. `{type:"grid", name, date_of_birth, age, marital_status}` or an account grid with `account_status, current_balance, party_ID_1, ...`).
- `block` = `{type:"block", label, text, tag}` (e.g. Residential address with a "No recent change of address" tag).
- `list` = `{type:"list", items:[[...nodes...]]}` — nested component arrays, used for the related/unrelated account groupings.
- `accordion` nests `content[]` and may nest further accordions.

### Verified facts for fixtures (these are real, use them)
- **2 customer profiles**, both with all 5 sections:
  - `customers[0]`: **Ms Alexandra Taylor**, DOB **22/12/1964**, age 61, party **46142591**
  - `customers[1]`: **Mr Frederick Hussain**, DOB **01/06/1967**, age 59, party **1420289780**
- The flagship failure scenario ("agent emits 2 customers, UI renders 1") is therefore **grounded in real data** — build it against these values.
- This sample is **data-sparse**: `trustedParties` failed for both parties, `contactNotes` empty, all 3 `analysis` sections are `variant:"ai_warning"` ("No Data"). This makes it the ideal fixture for **missing/empty-data paths**, but you have **not** seen a fully-populated `analysis` or non-empty contact notes. Treat rich-data shapes as assumptions to confirm against a second trace.

---

## 3. Architecture (services, not agents)

Keep the source prompt's layering, but implement the MVP as **plain deterministic services**. Do **not** scaffold six LLM "agents" — the source prompt names them conceptually but explicitly warns against making them all LLM calls. In the MVP, only the optional semantic check is an LLM.

```
                 ┌─────────────────────────────┐
                 │   Ground Truth Adapter (JSON) │   NormalizationEngine
                 └──────────────┬──────────────┘        │
                                ▼                        ▼
                       NORMALIZED EXPECTED MODEL  ◄───────┘
                                │
             ┌──────────────────┴───────────────────┐
             ▼                                       ▼
   ADK Contract Parser                     (optional) Playwright Executor
   → normalized contract model             → rendered evidence + screenshot
             │                                       │
             ▼                                       ▼
 ┌───────────────────────────┐         ┌──────────────────────────────┐
 │  DETERMINISTIC COMPARE #1  │         │  RENDER CHECK (optional)      │
 │  ground truth ↔ contract   │         │  contract ↔ rendered/visual   │
 │  ***CI GATE. NO BROWSER***  │         │  non-gating; visual fallback  │
 └────────────┬──────────────┘         └───────────────┬──────────────┘
              └───────────────┬───────────────────────┘
                              ▼
                   Failure Classifier + Evidence
                              ▼
              ┌───────────────┴──────────────┐
              ▼                               ▼
   Domain Validation Report          Playwright HTML Report
                              │
                              ▼
             (optional) Bounded Semantic Validator (LLM, fail-closed)
```

### Component responsibility matrix

| Component | Responsibility | Deterministic? | Browser? | MVP? |
|---|---|---|---|---|
| `GroundTruthProvider` (JSON impl) | Load source payload → raw entities | Yes | No | ✅ |
| `NormalizationEngine` | Canonicalize dates, ids, account numbers, names | Yes | No | ✅ |
| `AdkContractParser` | `JSON.parse(agentOutput)` → generic `UIComponentTree` → normalized contract model | Yes | No | ✅ |
| `ContractValidator` (Compare #1) | ground truth ↔ contract; count/identity/field diffs | Yes | No | ✅ |
| `GroundednessGate` | assert `groundednessCheck.status === "correct"` | Yes | No | ✅ |
| `FailureClassifier` | tag every diff with a failure class | Yes | No | ✅ |
| `ReportService` | domain report + evidence bundle | Yes | No | ✅ |
| `PlaywrightExecutor` | drive UI, collect screenshot/trace/text | N/A | Yes | ⏳ later |
| `RenderCheck` | contract ↔ rendered; **visual-snapshot fallback** | Yes | Yes | ⏳ later |
| `SemanticValidator` | LLM free-text faithfulness, fail-closed | No | No | ⏳ optional |
| `AgentAdapter` | per-agent glue (paths, rules, mappings) | Yes | No | ⏳ later |

---

## 4. The trust hierarchy and how the DOM problem is solved

**Decision: the DOM is not a source of business truth.** This is the user's firm constraint and it drives the design.

- **Compare #1 (ground truth ↔ ADK contract) is the real test.** It is pure JSON, runs headless in milliseconds, gates CI, and is immune to rendering changes. If the agent fetched the wrong data or built the wrong spec, this catches it. ~80% of coverage lives here.
- **The render check is secondary and non-gating**, and it must **not** depend on brittle structural locators. Two allowed strategies, in order of preference:
  1. **Semantic extraction** *only* via accessible role/name, visible text, headings, and intentional `data-testid`. If — and only if — the team adds stable `data-testid`/`data-field` hooks, assert spec-node presence against them.
  2. **Visual snapshot fallback** (`expect(page).toHaveScreenshot()` per expanded card / per complaint type). Asserts the *picture*, never the structure. This is how we keep the "2 customers rendered as 1" detection alive without coupling to the DOM: a dropped customer changes the snapshot.
- The render check **never** silently rewrites locators or hides a failure (no aggressive self-healing in MVP).

Practical rule for Cursor: **if a render assertion would require an nth-child, generated class, XPath depth, or React id, do not write it — fall back to the visual snapshot instead.**

---

## 5. Failure classification (the highest-value feature — keep it)

Every diff is tagged. This is what the three-way split buys and what leadership will read:

| Class | Meaning | Triggered when |
|---|---|---|
| `GROUND_TRUTH_FAILURE` | Source payload itself invalid/missing | payload can't be normalized |
| `AGENT_OUTPUT_FAILURE` | Agent produced wrong/missing data in the spec | ground truth ✔ but contract ✘ |
| `UI_CONTRACT_FAILURE` | Spec structurally malformed for the renderer | contract fails schema/well-formedness |
| `UI_RENDERING_FAILURE` | Spec correct, UI dropped/garbled it | contract ✔ but rendered/visual ✘ |
| `DATA_TRANSFORMATION_FAILURE` | Normalization/transform bug | expected≠actual only due to a transform |
| `GROUNDEDNESS_FAILURE` | `groundednessCheck.status !== "correct"` | agent self-reports ungrounded output |
| `TEST_EXECUTION_FAILURE` | Infra/timeout/navigation | Playwright throws |
| `VALIDATION_UNCERTAIN` | Semantic check couldn't decide | LLM returns UNCERTAIN or low confidence |

Worked example (real data): GT=2 customers, contract=2 customers, UI=1 → `UI_RENDERING_FAILURE`, missing = *Mr Frederick Hussain / 1420289780*, contract path `fact_find.customers[1]`.

---

## 6. Normalization rules (deterministic, no LLM)

Build a canonical model and normalize both sides into it before comparing.

| Field | Source shape | UI/spec shape | Canonical rule |
|---|---|---|---|
| DOB | ICA record fields | `"22/12/1964"` | ISO `1964-12-22`; parse both `DD/MM/YYYY` and source format |
| Party id | `46142591` (num) | `"46142591"` (str) | string, trimmed |
| Account number | may carry trailing pad | `"77110364287668"` | strip non-digits; compare canonical digits |
| Name | title + first + last | `"Ms Alexandra Taylor"` | compare on `{title,first,last}`; allow title-optional match |
| Money | source numeric | `"£0.00"` | numeric minor units; strip currency/format |
| Empty/absent | `[]`, `"None"`, missing | "No X recorded." / `ai_warning` | canonical `EMPTY` sentinel; empty-expected ≠ missing |

Normalization must be **pure and unit-tested**. If two values differ *only* after a transform, classify `DATA_TRANSFORMATION_FAILURE`, not `AGENT_OUTPUT_FAILURE`.

---

## 7. The generic UI component model (agent-agnostic core)

Do not hardcode Complaints-Workflow node names in the core. Parse into a generic tree:

```ts
interface UIComponent {
  type: string;                 // normalized lowercase
  label?: string;
  text?: string;
  attributes?: Record<string, unknown>;  // grid/block key→value bags land here
  children: UIComponent[];      // content[] / list.items[][] flattened into children
  path: string;                 // e.g. "fact_find.customers[1].sections[0]" for evidence
}
```

- `AdkContractParser` (core) turns `agentOutput` into `UIComponent[]` with stable `path`s.
- **Agent-specific meaning** (which accordion = customers, which grid keys = personal details) lives in the **adapter**, not the core. This is what lets the Communications Agent reuse the core with only a new adapter.

---

## 8. Ground-truth abstraction (swap-able sources)

```ts
interface GroundTruthProvider {
  getComplaint(): ComplaintMeta;
  getCustomers(): RawCustomer[];
  getAccounts(): RawAccount[];
  getContactNotes(partyId: string): RawNote[];
  getSupportNeeds(partyId: string): RawSupportNeed[];
  getRelatedParties(partyId: string): RawParty[];
}
```

MVP ships `JsonGroundTruthProvider`. The interface must allow REST / MCP / DB providers later **without touching the validation engine**.

---

## 9. Agent-agnostic design

```
core/            # NEVER references "complaints-workflow"
  parser/  normalization/  validation/  classification/  evidence/  reporting/
  playwright/    # executor + visual-snapshot util (later)
agents/
  complaints-workflow/
    adapter/       # implements AgentAdapter
    config/        # complaints-workflow.yaml
    mappings/      # accordion-label → entity, grid-key → field
    transformers/  # SupportNeeds/Account/Customer transformers
  communications/  # future — adapter + config only
```

```ts
interface AgentAdapter {
  getGroundTruthProvider(ctx): GroundTruthProvider;
  parseContract(agentOutputRaw: string): NormalizedContract;
  getValidationPlan(ctx): ValidationPlan;   // what entities/fields to check
  getPageObjects(): { /* later */ };
}
```

---

## 10. BDD + POM (preserved, thinned)

- **Feature files** stay business-readable; **step defs stay thin** — they call services, hold no logic.
- **POM is retained but demoted to a semantic extractor** for the *optional* render layer. Page objects expose data (`getCustomerProfiles(): NormalizedCustomer[]`), never `expect(...)`. In the MVP (no browser), POM is a stub interface only.

```gherkin
Scenario: All expected customer profiles are present in the agent contract
  Given the complaint reference "NC10010449"
  When the Complaints Workflow contract is loaded
  Then the contract should contain 2 customer profiles
  And each customer's personal details should match the source data
  And the groundedness check should be "correct"
```

---

## 11. Delivery milestones (reordered — value first, browser last)

Stop after each. Run tests. Report what was built, assumptions made, and what's next.

**MILESTONE A — Headless contract validation (the real MVP, no browser)**
- A1 Domain models + generic `UIComponent` tree.
- A2 `JsonGroundTruthProvider`.
- A3 `AdkContractParser` (`JSON.parse(agentOutput)`, case-insensitive types, `path` tagging).
- A4 `NormalizationEngine` (Section 6) + unit tests.
- A5 `ContractValidator` (ground truth ↔ contract): counts, identities, per-field diffs.
- A6 `GroundednessGate`.
- A7 `FailureClassifier` + domain report + evidence bundle (JSON).
- A8 CLI: `validate --agent complaints-workflow --input <payload> --contract <adk>`.
- **Exit criteria:** against the real files, framework passes the clean case and, with a mutated contract fixture (customer[1] removed), **fails with `AGENT_OUTPUT_FAILURE`, names Frederick Hussain / 1420289780, cites path `fact_find.customers[1]`.**

**MILESTONE B — Optional render check (browser, non-gating)**
- B1 `PlaywrightExecutor`: navigate, enter ref, search, wait, expand accordions, capture screenshot + trace + visible text.
- B2 `RenderCheck` with the two-strategy rule (semantic-only, else visual snapshot). No brittle locators, ever.
- B3 `UI_RENDERING_FAILURE` path + evidence (screenshot, trace, snapshot diff).
- **Exit criteria:** with a stubbed renderer dropping customer[1], the render check flags it via snapshot diff — with zero structural selectors.

**MILESTONE C — Extensibility + optional semantic AI**
- C1 `AgentAdapter` extraction; move all complaints-workflow specifics into `agents/complaints-workflow`.
- C2 Bounded `SemanticValidator` (LLM): structured JSON out (`status/confidence/evidence/reason`), fail-closed, PII-minimized, local/mock model for dev.
- C3 Second-adapter smoke (a trivial fake agent) proving the core is untouched.

---

## 12. What to produce BEFORE any code (deliver, then wait)

1. Architecture proposal (refine Section 3 for the actual repo you find).
2. Component responsibility matrix (confirm/adjust Section 3's table).
3. Data flow diagram.
4. Concrete project structure (fit it to the existing repo — see Section 13).
5. Validation lifecycle (load → normalize → parse → compare#1 → classify → report).
6. One example `ValidationResult` JSON for the real NC10010449 clean case.
7. How the core stays agent-agnostic (adapter boundary).
8. How POM + BDD are preserved but thinned.
9. Where AI is used vs deterministic (only C2 is AI).
10. Milestone-A implementation plan at file granularity.

**Then stop and wait for approval.**

---

## 13. Repo inspection rules (do this first)

Before proposing structure, inspect the existing repo and reuse it:
- Detect existing Playwright config, POM, BDD (Cucumber?), utils, reporters, package manager, tsconfig, lint, CI.
- **Integrate — do not fork a parallel framework.** Reuse existing abstractions; extend rather than duplicate (DRY/SOLID).
- Do not modify existing production tests unnecessarily.
- If something's missing, make the **smallest** reasonable assumption and **document it**. Do not invent APIs or ADK shapes beyond the sample.

---

## 14. Tech + privacy

- TypeScript, Playwright, BDD-compatible, JSON-Schema for contract well-formedness, DI where it earns its place, strong typing, unit + integration + e2e.
- Isolate any ADK specifics behind the adapter.
- PII: redact in logs/evidence; never send whole payloads to an external LLM; support a local/mock model in dev; keep evidence separable from raw sensitive data.

---

## 15. Success criterion (the one that matters)

Give the framework a complaint ref, a source payload, and an ADK response. It must:
load → normalize → parse contract → **compare ground-truth vs contract (headless, gating)** → optionally check render (non-gating, visual fallback) → classify → produce evidence + a domain report + integrate with Playwright reporting.

**Above all:** if the agent's contract contains two customers but only one reaches the user, the framework detects the missing customer (by name and party id, with a contract path and evidence) and fails — and it can tell you *which layer* dropped them.

---

## Appendix — open assumptions to confirm against a second, data-rich trace
1. Populated `analysis` section shape (sample only shows `ai_warning`/no-data).
2. Non-empty `contactNotes` / `supportNeeds` / `relatedParties` node shapes.
3. Whether `className` values in the spec survive into the live DOM, and whether any `data-testid` exists (decides how much of Milestone B can be semantic vs visual-only).
4. Account-number padding rule (whether trailing-zero padding actually occurs in source).
