// Stub (T0). T3a replaces draw() and adds axes(); the export shape is the contract.
import type { Mark, MarkCtx } from "../types.ts";

const draw = (ctx: MarkCtx): never => {
  throw new Error(`mayacharts: "${ctx.spec.type}" charts are not implemented yet`);
};

/** Line and area share one file: crosshair contract, stack for area. */
export const line: Mark = { noun: "Line", draw };
export const area: Mark = { noun: "Area", draw };
