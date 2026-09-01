#!/usr/bin/env npx tsx
import { mkdirSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { chromium } from "@playwright/test";
import { ValidationService } from "../services/validation-service.js";
import { renderMarkdown } from "../core/reporting/report-service.js";
import { startStubServer } from "../core/playwright/stub-server.js";
import type { ContractMutation, TestContext } from "../core/models/context.js";
import { isFailure } from "../core/models/validation-result.js";

const program = new Command();

program
  .name("validate")
  .description("ADK UI validation: contract (Compare #1) and optional rendered UI (Compare #2)")
  .requiredOption("--agent <id>", "Agent adapter id", "complaints-workflow")
  .option("--scenario <name>", "Validation scenario", "customer-profile")
  .option("--input <path>", "Ground-truth JSON path")
  .option("--contract <path>", "ADK response JSON path")
  .option("--complaint <ref>", "Complaint reference override")
  .option("--report <dir>", "Report output directory", "reports/validation")
  .option("--headed", "Open a visible browser for the render check", false)
  .option("--debug", "Print full JSON result", false)
  .option("--drop-customer <partyId>", "Mutation: drop this partyId from the ADK contract")
  .option("--drop-rendered-customer <partyId>", "Stub only: hide this partyId in the rendered UI")
  .option("--render", "Run Compare #2 against the stub/live page", false)
  .option("--ui-mode <mode>", "stub | live", "stub")
  .action(async (opts) => {
    const repoRoot = process.cwd();
    const input = path.resolve(opts.input ?? path.join(repoRoot, "NC10010449.json"));
    const contract = path.resolve(opts.contract ?? path.join(repoRoot, "adk_NC10010449.json"));
    const reportDir = path.resolve(opts.report);
    mkdirSync(reportDir, { recursive: true });

    const mutateContract: ContractMutation | undefined = opts.dropCustomer
      ? { dropCustomerPartyId: String(opts.dropCustomer) }
      : undefined;

    const ctx: TestContext = {
      agentId: opts.agent,
      scenario: opts.scenario,
      complaintRef: opts.complaint,
      groundTruthPath: input,
      contractPath: contract,
      headed: Boolean(opts.headed),
      debug: Boolean(opts.debug),
      reportDir,
      uiMode: opts.uiMode === "live" ? "live" : "stub",
      mutateContract,
      renderCheck: Boolean(opts.render),
      dropRenderedPartyId: opts.dropRenderedCustomer ? String(opts.dropRenderedCustomer) : undefined,
    };

    const service = new ValidationService();
    let result;

    if (opts.render) {
      const server = ctx.uiMode === "stub" ? await startStubServer(4173) : undefined;
      const browser = await chromium.launch({ headless: !opts.headed });
      const page = await browser.newPage();
      try {
        result = await service.runWithRender(ctx, page);
      } finally {
        await browser.close();
        await new Promise<void>((resolve, reject) => {
          if (!server) return resolve();
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    } else {
      result = service.run(ctx);
    }

    process.stdout.write(`${renderMarkdown(result)}\n`);
    if (opts.debug) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    process.exitCode = isFailure(result) ? 1 : 0;
  });

program.parseAsync(process.argv);
