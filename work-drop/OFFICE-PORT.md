# Port the config-driven Fact Find compare onto the office repo

Repo: `cce2ec-qe-playwright-e2e`
Target directory: `factfind/src/a2ui-engine/agents/complaints-workflow/`

Do this on a branch. Do not paste over `complaints-rules.ts` or `compare-factfind-files.ts` blindly.

---

## 0. The trap

The office file is ~1,125 lines and already has:

- `compareFactFindReport()` returning `{ passed, fieldsChecked, summary, findings[] }`
- `compareStoredFactFind()` writing `factfind/comparison-reports/${ref}.json`
- `npm run adk_dashboard` reading those JSON files
- `extractFromWorkflowTrace` + `mergeAgentFacts` (fallback when `final_agent_response` is missing)

This drop now also has a report model (`comparison-report.ts` + `compareFactFindReport`).
The shapes are close, but they are **not** byte-identical. Overwriting the office
`complaints-rules.ts` would still delete the workflow-trace fallback and any extra
exports the dashboard or Cucumber steps import.

Copy the **new modules**. Keep the office **facade and file I/O**. Slide the map
underneath.

---

## 1. Snapshot what is there today

On the office machine, from the work-repo root:

```bash
git checkout -b factfind-config-map
git status
ls factfind/src/a2ui-engine/agents/complaints-workflow/
```

Copy the current files aside so you can diff later:

```bash
DIR=factfind/src/a2ui-engine/agents/complaints-workflow
cp "$DIR/complaints-rules.ts" /tmp/office-complaints-rules.ts
cp "$DIR/compare-factfind-files.ts" /tmp/office-compare-factfind-files.ts
```

Then dump the **public surface** you must keep:

```bash
rg -n "^export " "$DIR/complaints-rules.ts" "$DIR/compare-factfind-files.ts"
rg -n "compareFactFind|compareFactFindReport|compareStoredFactFind|extractFromWorkflowTrace|mergeAgentFacts|ComparisonReport|FindingStatus" \
  factfind features step-definitions --glob '*.ts'
```

Write down every export that anything else imports. Those names must still exist
after the port.

Typical keep-list:

| Symbol | Who uses it |
|---|---|
| `compareFactFind` | Cucumber step `fact find in agent output should match...` |
| `compareFactFindReport` | `compareStoredFactFind`, dashboard |
| `compareStoredFactFind` | “every loaded reference” scenario |
| `loadAggregatedPayload` / `loadAgentOutputFile` | steps + compare files |
| `extractFromAggregated` / `extractFromAgentOutput` / `readFactFindUi` | tests / debug |
| `extractFromWorkflowTrace` / `mergeAgentFacts` | office-only fallback — keep |

---

## 2. Copy only these four files from this drop

From this laptop’s `work-drop/factfind/src/a2ui-engine/agents/complaints-workflow/`
into the same path on the office repo:

```
json-get.ts
factfind-map.ts
compare-map.ts
comparison-report.ts
```

Do **not** copy yet:

- `complaints-rules.ts` — office version has extra functions
- `compare-factfind-files.ts` — office version writes reports to disk
- `dashboard/` — office already has `npm run adk_dashboard`
- `factfind-report.ts` — POC-only CLI; office already writes JSON via `compareStoredFactFind`

Imports in this drop are **extensionless** (`from "./json-get"`). That matches the
office repo. Do not add `.js` suffixes over there.

---

## 3. Make `complaints-rules.ts` a thin wrapper

Do not delete the office file. Replace the **compare + extract internals** and
leave the rest.

### 3a. Add the new imports (extensionless)

```ts
import { first14, readFactFindUi, str, uniqueSorted } from "./json-get";
import { factFindMap } from "./factfind-map";
import {
  failuresOf,
  money,
  readSourceView,
  readUiView,
  runCompare,
  toIsoDate,
  toIsoDateTime,
  type CompareResult,
  type CustomerView,
  type ItemView,
  type SideView,
} from "./compare-map";
import { reportOf, type ComparisonReport } from "./comparison-report";
```

Re-export whatever the office file already re-exported (`first14`, `readFactFindUi`,
`ComparisonReport`, `ComparisonFinding`, `FindingStatus`). If the office types
live in `complaints-rules.ts` today, either:

- re-export them from `./comparison-report`, **or**
- keep the office type names as aliases so callers do not change.

`reportOf` already exports:

```ts
FindingStatus, ComparisonFinding, ComparisonReport
```

If the office `FindingStatus` union has extra members, add them in
`comparison-report.ts` rather than inventing a second union.

### 3b. Replace extract + compare with the map

Keep the office `FactFindFacts` types if tests/steps depend on them.
Wire extractors like this (already in the drop’s `complaints-rules.ts`):

```ts
export function extractFromAggregated(aggregated: unknown): FactFindFacts {
  return toFacts(readSourceView(aggregated, factFindMap));
}

export function extractFromAgentOutput(adk: unknown): FactFindFacts {
  return toFacts(readUiView(adk, factFindMap));
}

function compare(aggregated: unknown, adk: unknown): CompareResult {
  return runCompare(
    readSourceView(aggregated, factFindMap),
    readUiView(adk, factFindMap),
    factFindMap,
  );
}

export function compareFactFind(aggregated: unknown, adk: unknown): void {
  const failures = failuresOf(compare(aggregated, adk));
  assert.equal(failures.length, 0, `Fact-find mismatch:\n\n${failures.join("\n\n")}`);
}

export function compareFactFindReport(aggregated: unknown, adk: unknown): ComparisonReport {
  return reportOf(compare(aggregated, adk));
}
```

Copy `toFacts` / `toCustomerFacts` / `toAccountFacts` from this drop if the office
`FactFindFacts` shape matches. If it has extra fields (`gender`, `supportRequired`,
`productType`, …), project them from `customer.fields` / `account.fields` the same way.

### 3c. Keep the workflow-trace fallback (office only)

Leave `extractFromWorkflowTrace` and `mergeAgentFacts` in `complaints-rules.ts`.
Call them **before** `readUiView` only when the tree is missing:

```ts
export function extractFromAgentOutput(adk: unknown): FactFindFacts {
  const ui = readFactFindUi(adk);
  if (!ui?.fact_find) {
    return mergeAgentFacts(extractFromWorkflowTrace(adk), /* empty facts */);
  }
  return toFacts(readUiView(adk, factFindMap));
}
```

Do not try to express workflow events as map rows. That path is imperative on
purpose.

### 3d. Delete the old imperative compare

Once the wrappers compile, delete from `complaints-rules.ts`:

- the old `customerFields` / `collectionFields` / `collectionFieldAccessors` tables
- the old `walk()` / accordion scanners
- the old `addFinding` / status switch that duplicated `comparison-report.ts`

Keep only: types, `toFacts` projection, extract facades, compare facades,
workflow-trace fallback.

---

## 4. Keep `compare-factfind-files.ts` as the disk writer

Do not replace this file with the drop’s version. The drop only throws.
The office version must still write JSON for `adk_dashboard`.

Expected shape (adapt to what you actually have):

```ts
import fs from "fs";
import path from "path";
import { compareFactFindReport } from "./complaints-rules";

export function compareStoredFactFind(complaintRef: string): void {
  const aggregated = loadAggregatedPayload(complaintRef);
  const adk = loadAgentOutputFile(complaintRef);
  const report = compareFactFindReport(aggregated, adk);
  const reportPath = path.join(
    process.cwd(),
    "factfind",
    "comparison-reports",
    `${complaintRef}.json`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ complaintRef, generatedAt: new Date().toISOString(), ...report }, null, 2),
  );
  if (!report.passed) {
    throw new Error(
      `Fact-find mismatch for ${complaintRef}: ${report.findings
        .filter((f) => f.status !== "NOT ASSESSABLE")
        .map((f) => `${f.section}/${f.field}: ${f.status}`)
        .join("; ")}`,
    );
  }
}
```

If the dashboard expects extra keys (`generatedAt`, `sourceFile`, `agentFile`,
`uiOrigin`), keep writing them. Add fields; do not remove any the dashboard reads.

If the office `FindingStatus` used slightly different labels, map once here,
not inside the runner.

---

## 5. Do not touch the dashboard yet

`npm run adk_dashboard` should keep working as long as
`factfind/comparison-reports/*.json` still has:

- `passed`
- `fieldsChecked`
- `summary`
- `findings[]` with `section`, `partyId`, `itemKey`, `field`, `status`,
  `sourceValue`, `agentValue`, `explanation`

`NOT ASSESSABLE` is new-as-non-blocking. If the dashboard treats every finding as
a fail, either:

- filter `status !== "NOT ASSESSABLE"` in the dashboard, or
- rely on `passed` (preferred — it already ignores those).

---

## 6. Behaviour you should expect (do not “fix” these)

These are deliberate, and they will change office reports vs the 1,125-line file.

| Topic | Old office behaviour | New map |
|---|---|---|
| Unrendered fields (`gender`, `dateOfDeath`, `supportRequired`, `productType`, `productGroup`, `closed`) | usually `MISSING FIELD` → ref fails | `optional: true` → `NOT ASSESSABLE` → ref still passes |
| Empty set on both sides (`unrelatedAccounts` with none) | often skip / pass | pass; inventing an account is `EXTRA FIELD` + `EXTRA ITEM` |
| Accordion says “No support needs recorded.” | treated like empty list | empty list, **pass** |
| Accordion missing entirely | often same as empty | `MISSING SECTION` → **fail** |
| Payload `NC10010449` vs trace `NC10010556` | compared anyway | `complaintRef` root rule → **fail** |
| Live chat / card freeze | out of contract | still out of contract — do not add rows |

If a first run on ~35 refs is suddenly all-red, check whether findings are
`NOT ASSESSABLE` (ok) or `VALUE MISMATCH` / `MISSING SECTION` (real).

---

## 7. Compile, then run one ref, then all refs

```bash
# typecheck the folder (adjust to the office tsconfig)
npx tsc --noEmit --esModuleInterop --strict --target es2020 --moduleResolution node \
  factfind/src/a2ui-engine/agents/complaints-workflow/*.ts
```

Fix import errors first. Common ones:

- `.js` suffixes (remove them)
- `ComparisonReport` imported from `complaints-rules` vs `comparison-report`
- missing `extractFromWorkflowTrace` after the trim

Then one known-good pair (same refs as this POC):

```bash
# however the office script is named — from screenshots:
npm run ADK_agentoutput_compare
# or the cucumber scenario for NC10010449 / NC10010556
```

Then the full Examples table (~35 refs).

Compare a new `factfind/comparison-reports/NC10010449.json` against the snapshot
you kept. `passed` should stay true. Extra findings should be `NOT ASSESSABLE`
for unrendered fields, not `VALUE MISMATCH`.

---

## 8. Parity check against the old file

Keep `/tmp/office-complaints-rules.ts` as `compareFactFindLegacy` for one PR:

```ts
// temporarily: copy the old compareFactFind as compareFactFindLegacy
```

For each ref:

1. Run new `compareFactFindReport`
2. Run legacy compare (or diff the previous `comparison-reports/${ref}.json`)
3. Classify the delta:
   - new `NOT ASSESSABLE` that used to be `MISSING FIELD` → expected
   - new `MISSING SECTION` that used to pass → expected if the accordion is absent
   - any `VALUE MISMATCH` the legacy run did not have → stop and inspect the map row

Do not delete the legacy function until the 35-ref table is understood.

---

## 9. Add a field later (office, same as POC)

Open `factfind-map.ts` only. One row:

```ts
{ field: "example", source: "party.example", ui: { at: personal("example") }, match: "equal" }
```

If the screen does not render it yet, add `optional: true`.
Do not put field names in `compare-map.ts`.

---

## 10. Prompt to paste into the office Cursor agent

Copy everything below the line.

---

Port the A2UI-POC config-driven Fact Find compare into this repo without breaking
`adk_dashboard` or Cucumber.

I have copied four new files into
`factfind/src/a2ui-engine/agents/complaints-workflow/`:
`json-get.ts`, `factfind-map.ts`, `compare-map.ts`, `comparison-report.ts`.
Imports are extensionless on purpose.

Do NOT overwrite `complaints-rules.ts` or `compare-factfind-files.ts`.

Required behaviour:

1. Keep every current export those two files already have
   (`compareFactFind`, `compareFactFindReport`, `compareStoredFactFind`,
   `extractFromAggregated`, `extractFromAgentOutput`, `readFactFindUi`,
   `extractFromWorkflowTrace`, `mergeAgentFacts`, and any others rg finds).
2. Make `complaints-rules.ts` a thin facade: extractors call `readSourceView` /
   `readUiView` + `toFacts`; `compareFactFind` throws via `failuresOf`;
   `compareFactFindReport` returns `reportOf(runCompare(...))`.
3. Keep the workflow-trace fallback as imperative code. Use it only when
   `readFactFindUi(adk).fact_find` is missing.
4. `compareStoredFactFind` must still write `factfind/comparison-reports/${ref}.json`
   and throw when `report.passed` is false. Do not drop keys the dashboard reads.
5. Unrendered fields in the map are `optional` and must stay `NOT ASSESSABLE`,
   not `MISSING FIELD`. Do not “fix” that by making them required.
6. Do not add live chat or card freeze to the map.
7. Typecheck, then run `ADK_agentoutput_compare` (or the cucumber fact-find
   feature) on NC10010449 and NC10010556 first, then the full catalog.
8. Diff one new comparison-report JSON against the previous file. Summarise
   which statuses appeared/disappeared. Stop if you see unexpected VALUE MISMATCH.

Read `OFFICE-PORT.md` in the drop folder before editing.
