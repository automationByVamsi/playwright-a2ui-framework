# A2UI validation

The page is not a stable POM. The ADK `agentOutput` tree **is** the spec. Tests walk that tree and assert each node on screen.

```
fixtures/NC10010449.json     source systems
fixtures/adk_NC10010449.json  what the agent said to render
Hive / local stub            what the user sees
```

## Two functions

| Call | When it fails, open |
|---|---|
| `compareFactFind(aggregated, adkFile)` | The error message + the two JSON files |
| `verifyTraceOnPage(page, trace, container)` | The Playwright error (label + ADK path) + `src/engine/adapters/<type>.ts` |

For a report rather than a throw, `compareFactFindReport` returns the same run as
`{ passed, fieldsChecked, summary, findings[] }`. It is false on exactly the runs
`compareFactFind` rejects; `NOT ASSESSABLE` findings name the rows one side is
silent about and never fail a run.

```ts
compareFactFind(aggregatedPayload, agentOutputTrace);
await verifyTraceOnPage(page, agentOutputTrace, this.complaintsWorkflowPage.factFindRoot);
```

`compareFactFind` reads `final_agent_response.fact_find` (fallback `agentOutput`) and compares every Fact Find customer to aggregated.  
`verifyTraceOnPage` is shared — any agent that emits accordion/grid/text.

## Scale

| Change | What you edit |
|---|---|
| New A2UI `type` | `src/engine/adapters/<type>.ts` + `registerAdapter` |
| New Complaints rule | One row in `src/agents/complaints-workflow/factfind-map.ts` |
| Field the tree does not render yet | Same row, `optional: true` — it skips until the UI shows it |
| New agent | New `*-rules.ts` if it has different meaning; reuse `verifyTraceOnPage` |

## Commands

```bash
npm test           # parser, adapters, complaints rules
npm run test:e2e   # stub UI + walker + axe
npm run dashboard  # review every fixture pair field by field
npm run report all # the same verdicts as JSON
```

Local UI: `npx tsx src/core/playwright/stub-server.ts` → http://127.0.0.1:4173

The dashboard needs `pip install -r dashboard/requirements.txt` once. It shells out to
`factfind-report.ts`, so what it shows is what the assertion decided.
