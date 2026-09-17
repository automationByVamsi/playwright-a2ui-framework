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
| New Complaints rule | Add a field to `FactFindFacts` and both extract functions |
| New agent | New `*-rules.ts` if it has different meaning; reuse `verifyTraceOnPage` |

## Commands

```bash
npm test          # parser, adapters, complaints rules
npm run test:e2e  # stub UI + walker + axe
```

Local UI: `npx tsx src/core/playwright/stub-server.ts` → http://127.0.0.1:4173
