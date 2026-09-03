# A2UI validation

The ADK `agentOutput` tree is the UI spec. Tests do not scrape raw APIs or use hashed CSS.

```
fixtures/NC10010449.json     source systems (ground truth)
fixtures/adk_NC10010449.json  agentOutput schema
Hive / local stub            what the user sees
```

## Three tiers

1. **In memory** (`src/validators/`) — party ids, related vs unrelated accounts, groundedness banner. No browser.
2. **Trace → DOM** (`src/engine/`) — walk each accordion/grid/block and assert it is on screen.
3. **A11y + pixels** — axe on `#main-content`, screenshots of the groundedness banner and support-need callout.

## Commands

```bash
npm install
npx playwright install chromium
npm test                 # Tier 1 + parser + adapters
npm run test:e2e         # full 3-tier Playwright flow
```

Local UI: `npx tsx src/core/playwright/stub-server.ts` then http://127.0.0.1:4173

## Add a new A2UI component type

1. `src/engine/adapters/timeline.ts` implementing `ComponentAdapter`
2. `registerAdapter(...)` in `src/engine/registry.ts`

## Layout

```
src/engine/       walker + catalog adapters
src/validators/   Tier 1 groundedness contract
src/core/         parser, normalizer, ground-truth JSON
src/pages/        navigation only
fixtures/         NC10010449 payloads
tests/e2e/        three-tier spec
```
