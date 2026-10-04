// Stub (T0). T4c implements the marks; importing this file registers the types.
import { register } from "./core/registry.ts";
import type { Mark, MarkCtx } from "./core/types.ts";

const draw = (ctx: MarkCtx): never => {
  throw new Error(`mayacharts: "${ctx.spec.type}" charts are not implemented yet`);
};

register("hexmap", { noun: "Hexmap", draw } satisfies Mark);

export {};
