// Stub (T0). T3c replaces draw() and adds axes(); the export shape is the contract.
import type { Mark, MarkCtx } from "../types.ts";

const draw = (ctx: MarkCtx): never => {
  throw new Error(`mayacharts: "${ctx.spec.type}" charts are not implemented yet`);
};

/** x = column category, series = row category; ramp legend; labels default on at >= 24 px. */
export const heatmap: Mark = { noun: "Heatmap", draw };
