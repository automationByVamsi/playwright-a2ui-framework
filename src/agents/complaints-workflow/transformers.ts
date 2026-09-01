/**
 * Deterministic transform extension point.
 * Agent-specific mapping belongs here — not in the comparison engine.
 */
export interface Transformer<TIn, TOut> {
  transform(input: TIn): TOut;
}
