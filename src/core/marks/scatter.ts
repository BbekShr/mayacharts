// Stub (T0). T3b replaces draw() and adds axes(); the export shape is the contract.
import type { Mark, MarkCtx } from "../types.ts";

const draw = (ctx: MarkCtx): never => {
  throw new Error(`mayacharts: "${ctx.spec.type}" charts are not implemented yet`);
};

/** Bypasses shape(): one point per row, numeric x, optional size/name/xDomain. */
export const scatter: Mark = { noun: "Scatter", draw };
