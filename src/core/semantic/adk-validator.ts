import type { SemanticValidationInput, SemanticValidationResult } from "./types.js";

/**
 * Google ADK 2.x semantic validator.
 *
 * Milestone A does not invoke this. Milestone C will construct an ADK 2.0
 * agent (`@google/adk` ^2.0.0) that returns structured JSON only:
 * { status, confidence, evidence, reason }.
 *
 * Fail-closed: missing key, low confidence, or UNCERTAIN !== PASS.
 */
export class AdkSemanticValidator {
  constructor(private readonly model = process.env.ADK_SEMANTIC_MODEL ?? "gemini-2.5-flash") {}

  async validate(_input: SemanticValidationInput): Promise<SemanticValidationResult> {
    void this.model;
    return {
      status: "UNCERTAIN",
      confidence: 0,
      evidence: [],
      reason: "Semantic validation is disabled in Milestone A. Enable in Milestone C with @google/adk ^2.0.0.",
    };
  }
}
