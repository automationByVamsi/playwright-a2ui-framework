import type { SemanticValidationInput, SemanticValidationResult } from "./types.js";

export class MockSemanticValidator {
  async validate(_input: SemanticValidationInput): Promise<SemanticValidationResult> {
    return {
      status: "UNCERTAIN",
      confidence: 0,
      evidence: [],
      reason: "Mock semantic validator — not a source of truth.",
    };
  }
}
