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
| `assertComplaintsRules(aggregated, trace)` | The error message + the two JSON files |
| `verifyTraceOnPage(page, trace, container)` | The Playwright error (label + ADK path) + `src/engine/adapters/<type>.ts` |

```ts
assertComplaintsRules(aggregatedPayload, agentOutputTrace);
await verifyTraceOnPage(page, agentOutputTrace, this.complaintsWorkflowPage.factFindRoot);
```

`assertComplaintsRules` is Complaints-only (party ids, related ICA account, groundedness `correct`).  
`verifyTraceOnPage` is shared — any agent that emits accordion/grid/text.

## Scale

| Change | What you edit |
|---|---|
| New A2UI `type` | `src/engine/adapters/<type>.ts` + `registerAdapter` |
| New Complaints rule | One `assert.*` in `complaints-rules.ts` |
| New agent | New `*-rules.ts` if it has different meaning; reuse `verifyTraceOnPage` |

## Commands

```bash
npm test          # parser, adapters, complaints rules
npm run test:e2e  # stub UI + walker + axe
```

Local UI: `npx tsx src/core/playwright/stub-server.ts` → http://127.0.0.1:4173
