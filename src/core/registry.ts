/*
 * Mark registry for optional modules (hierarchy, flow, geo). Imports nothing at runtime,
 * so every bundle that includes it (index, element, each module, the IIFE) shares one
 * table through a version-keyed global symbol. First definer wins; the property is
 * non-writable and non-configurable so a later bundle cannot swap the table.
 * Core marks are NOT here: they live in render.ts's static CORE map.
 */
import type { Mark } from "./types.ts";

// ponytail: kept in sync with package.json by hand (one line, checked at release).
export const VERSION = "0.0.1";
// ponytail: keyed by major; pre-1.0 Mark-contract breaks must bump this by hand.
export const MAJOR = "0";

const KEY = Symbol.for("mayacharts.marks@" + MAJOR);
if (!Object.hasOwn(globalThis, KEY))
  Object.defineProperty(globalThis, KEY, { value: new Map<string, Mark>() });

/** type -> Mark for every registered module type (shared across bundles). */
export const MODULES = (globalThis as unknown as Record<symbol, Map<string, Mark>>)[KEY]!;

/** Types that ship in core (static CORE map in render.ts). */
export const CORE_TYPES = ["bar", "line", "area", "scatter", "heatmap", "waterfall"] as const;

/** Module types and the import that provides them (for the unknown-type hint). */
export const MODULE_OF: Readonly<Record<string, string>> = {
  treemap: "hierarchy",
  sunburst: "hierarchy",
  sankey: "flow",
  hexmap: "geo",
};

/** Not exported from the public entry: modules call it on import. First wins. */
export function register(type: string, mark: Mark): void {
  if (!MODULES.has(type)) MODULES.set(type, mark);
  // Connected <maya-chart>s re-render on this, so late module loads fix "unknown type".
  if (typeof globalThis.dispatchEvent === "function")
    globalThis.dispatchEvent(new Event("maya-register"));
}

/** Registered module types. */
export const types = (): string[] => [...MODULES.keys()];
