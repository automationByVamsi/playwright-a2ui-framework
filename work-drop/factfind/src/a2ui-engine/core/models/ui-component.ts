/**
 * Generic UI component node. Agent-agnostic.
 * Agent-specific meaning (which accordion is a customer) lives in adapters.
 */
export interface UIComponent {
  type: string;
  label?: string;
  text?: string;
  attributes: Record<string, unknown>;
  children: UIComponent[];
  path: string;
}

export interface ParsedAgentContract {
  raw: Record<string, unknown>;
  tree: UIComponent[];
  source: "agentOutput" | "inline";
}
