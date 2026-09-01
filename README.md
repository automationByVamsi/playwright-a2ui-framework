# AI UI Validation Framework

Deterministic validation for ADK/A2-style agent UIs. Playwright is the executor and evidence collector — not the source of business truth.

## Milestone A (this drop)

Headless **Compare #1**: ground truth JSON ↔ ADK UI contract.

```bash
npm install
npm test
npm run test:bdd
npm run validate -- --agent complaints-workflow --input ./NC10010449.json --contract ./adk_NC10010449.json
```

Prove the missing-customer gate:

```bash
npm run validate -- --drop-customer 1420289780
```

Expect `FAIL`, class `AGENT_OUTPUT_FAILURE`, missing **Mr Frederick Hussain** / `1420289780`.

## Switching to the live app (work machine)

```bash
export UI_MODE=live
export LIVE_URL="https://<your-int-host>/.../agent/complaints_workflow"
```

This machine uses the stub at `stubs/complaints-workflow` (`UI_MODE=stub`, default).

## Milestone B — rendered UI (localhost stub)

```bash
npx playwright install chromium
npm run test:e2e
npm run validate -- --render
npm run validate -- --render --drop-rendered-customer 1420289780
```

Open the stub yourself: `npx tsx src/core/playwright/stub-server.ts` then http://127.0.0.1:4173

- Clean stub: 2 customer tabs → **PASS**
- `?drop=1420289780`: contract still has 2, UI has 1 → **`UI_RENDERING_FAILURE`**

## What is not in this drop

- Google ADK 2.0 semantic faithfulness checks (Milestone C; interface at `src/core/semantic/adk-validator.ts`)
