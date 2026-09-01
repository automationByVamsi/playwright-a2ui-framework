import { setWorldConstructor, World, IWorldOptions } from "@cucumber/cucumber";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import type { Server } from "node:http";
import { ValidationService } from "../../src/services/validation-service.js";
import type { ContractMutation, TestContext } from "../../src/core/models/context.js";
import type { ValidationResult } from "../../src/core/models/validation-result.js";

export class ValidationWorld extends World {
  complaintRef = "";
  mutation?: ContractMutation;
  dropRenderedPartyId?: string;
  result?: ValidationResult;
  page?: Page;
  browser?: Browser;
  server?: Server;
  readonly service = new ValidationService();

  constructor(options: IWorldOptions) {
    super(options);
  }

  buildContext(): TestContext {
    return {
      agentId: "complaints-workflow",
      scenario: this.dropRenderedPartyId || this.page ? "customer-profile-render" : "customer-profile",
      complaintRef: this.complaintRef || undefined,
      groundTruthPath: path.resolve("NC10010449.json"),
      contractPath: path.resolve("adk_NC10010449.json"),
      reportDir: path.resolve("reports/validation"),
      uiMode: "stub",
      mutateContract: this.mutation,
      renderCheck: Boolean(this.page),
      dropRenderedPartyId: this.dropRenderedPartyId,
    };
  }
}

setWorldConstructor(ValidationWorld);
