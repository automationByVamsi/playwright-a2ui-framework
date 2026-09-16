import type { ParsedAgentContract, UIComponent } from "../models/ui-component";

const STRUCTURAL_KEYS = new Set([
  "type",
  "content",
  "children",
  "items",
  "label",
  "text",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseNode(node: unknown, path: string): UIComponent {
  const obj = asRecord(node);
  if (!obj) {
    return {
      type: "unknown",
      attributes: { value: node },
      children: [],
      path,
    };
  }

  const rawType = obj.type != null ? String(obj.type) : inferType(obj, path);
  const type = rawType.toLowerCase();

  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!STRUCTURAL_KEYS.has(key)) {
      attributes[key] = value;
    }
  }

  const children: UIComponent[] = [];

  if (Array.isArray(obj.content)) {
    obj.content.forEach((child, i) => {
      children.push(parseNode(child, `${path}.content[${i}]`));
    });
  } else if (obj.content != null && typeof obj.content === "object") {
    children.push(parseNode(obj.content, `${path}.content`));
  } else if (typeof obj.content === "string") {
    attributes.contentText = obj.content;
  }

  if (Array.isArray(obj.items)) {
    obj.items.forEach((group, gi) => {
      if (Array.isArray(group)) {
        group.forEach((item, ii) => {
          children.push(parseNode(item, `${path}.items[${gi}][${ii}]`));
        });
      } else {
        children.push(parseNode(group, `${path}.items[${gi}]`));
      }
    });
  }

  if (Array.isArray(obj.children)) {
    obj.children.forEach((child, i) => {
      children.push(parseNode(child, `${path}.children[${i}]`));
    });
  }

  if (Array.isArray(obj.sections)) {
    obj.sections.forEach((child, i) => {
      children.push(parseNode(child, `${path}.sections[${i}]`));
    });
  }

  if (Array.isArray(obj.customers)) {
    obj.customers.forEach((child, i) => {
      children.push(parseNode(child, `${path}.customers[${i}]`));
    });
  }

  return {
    type,
    label: typeof obj.label === "string" ? obj.label : undefined,
    text: typeof obj.text === "string" ? obj.text : undefined,
    attributes,
    children,
    path,
  };
}

function inferType(obj: Record<string, unknown>, path: string): string {
  if (path.endsWith("summaryBox") || path.endsWith("summarybox")) return "summarybox";
  if (obj.customers) return "fact_find";
  if (obj.sections) return "block";
  return "object";
}

function parseAgentOutputObject(parsed: Record<string, unknown>): UIComponent[] {
  const tree: UIComponent[] = [];
  const summary = parsed.summaryBox ?? parsed.summarybox;
  if (summary) {
    tree.push(parseNode({ type: "summaryBox", ...(asRecord(summary) ?? {}) }, "summaryBox"));
  }
  if (parsed.analysis) {
    tree.push(parseNode({ type: "block", ...(asRecord(parsed.analysis) ?? {}) }, "analysis"));
  }
  if (parsed.fact_find) {
    tree.push(parseNode({ type: "fact_find", ...(asRecord(parsed.fact_find) ?? {}) }, "fact_find"));
  }
  return tree;
}

/**
 * Parses an ADK capture file (`{ agentOutput: string, ... }`) or a raw agentOutput object.
 */
export function parseAdkContract(input: unknown): ParsedAgentContract {
  if (typeof input === "string") {
    const parsed = JSON.parse(input) as unknown;
    return parseAdkContract(parsed);
  }

  const root = asRecord(input);
  if (!root) {
    throw new Error("ADK contract is not a JSON object");
  }

  if (typeof root.agentOutput === "string") {
    let inner: unknown;
    try {
      inner = JSON.parse(root.agentOutput);
    } catch (err) {
      throw new Error(`agentOutput is not valid JSON: ${(err as Error).message}`);
    }
    const innerObj = asRecord(inner);
    if (!innerObj) {
      throw new Error("Parsed agentOutput is not an object");
    }
    return {
      raw: innerObj,
      tree: parseAgentOutputObject(innerObj),
      source: "agentOutput",
    };
  }

  if (root.summaryBox || root.summarybox || root.fact_find) {
    return {
      raw: root,
      tree: parseAgentOutputObject(root),
      source: "inline",
    };
  }

  throw new Error("Unrecognised ADK contract shape: expected agentOutput string or UI spec object");
}

export function findByType(tree: UIComponent[], type: string): UIComponent[] {
  const want = type.toLowerCase();
  const found: UIComponent[] = [];
  const walk = (nodes: UIComponent[]) => {
    for (const node of nodes) {
      if (node.type === want) found.push(node);
      walk(node.children);
    }
  };
  walk(tree);
  return found;
}

export function findByLabel(tree: UIComponent[], label: string): UIComponent[] {
  const want = label.toLowerCase();
  const found: UIComponent[] = [];
  const walk = (nodes: UIComponent[]) => {
    for (const node of nodes) {
      if ((node.label ?? "").toLowerCase() === want) found.push(node);
      walk(node.children);
    }
  };
  walk(tree);
  return found;
}
