import type { NormalizedCustomer } from "./normalized.js";

export interface RenderedUiModel {
  complaintRef?: string;
  customers: NormalizedCustomer[];
  visibleText: string;
  strategy: "semantic" | "visual-fallback";
}

export interface RenderEvidence {
  screenshotPath?: string;
  accessibilitySnapshotPath?: string;
}
