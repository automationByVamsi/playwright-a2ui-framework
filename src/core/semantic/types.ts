export interface SemanticValidationInput {
  groundTruthPath: string;
  groundTruthExcerpt: string;
  agentExcerpt: string;
}

export interface SemanticValidationResult {
  status: "PASS" | "FAIL" | "UNCERTAIN";
  confidence: number;
  evidence: string[];
  reason: string;
}
