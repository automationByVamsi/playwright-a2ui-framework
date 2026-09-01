export type { FailureClass, CheckStatus } from "./failure.js";
export { FAILURE_CLASSES } from "./failure.js";
export type { UIComponent, ParsedAgentContract } from "./ui-component.js";
export type {
  EmptySentinel,
  NormalizedName,
  NormalizedAddress,
  NormalizedDuration,
  NormalizedAccount,
  NormalizedCustomer,
  NormalizedComplaint,
  NormalizedExpectedModel,
  NormalizedContractModel,
} from "./normalized.js";
export { EMPTY } from "./normalized.js";
export type {
  FieldDiff,
  EntityResult,
  LayerResult,
  ValidationResult,
} from "./validation-result.js";
export { isFailure } from "./validation-result.js";
export type { TestContext, ContractMutation } from "./context.js";
