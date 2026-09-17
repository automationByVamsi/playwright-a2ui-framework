/*
  Paste this GUARD at the top of the BeforeScenario (or equivalent) in hooks/ui-hooks.ts
  BEFORE:  await this.page.goto(process.env.HIVE_UI);

  Your error was:
    page.goto: url: expected string, got undefined
  because HIVE_UI was not set. Two separate fixes:

  1) @factfind-contract — skip goto entirely (JSON-only).
  2) @a2ui — set HIVE_UI (same env file your CW / FFA_Sanity scripts load).
*/

// --- paste into BeforeScenario ---
const tags: string[] = this.testInfo?.tags ?? [];
const skipHive = tags.includes("@factfind-contract");

if (skipHive) {
  return;
}

const hiveUi = process.env.HIVE_UI;
if (!hiveUi) {
  throw new Error(
    "HIVE_UI is not set. Load your UI env (e.g. ENV_FILE_NAME=.env.ui) before @a2ui tests. " +
      "@factfind-contract does not need Hive — tag the scenario @factfind-contract so this hook returns early.",
  );
}

await this.page.goto(hiveUi);
// --- end paste ---
