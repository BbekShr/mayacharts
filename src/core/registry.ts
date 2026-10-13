/*
 * Mark registry for optional modules (hierarchy, flow, geo, radial, stats, weave, units, orbit,
 * constellation). Imports nothing at runtime,
 * so every bundle that includes it (index, element, each module, the IIFE) shares one
 * table through a version-keyed global symbol. First definer wins; the property is
 * non-writable and non-configurable so a later bundle cannot swap the table.
 * Core marks are NOT here: they live in render.ts's static CORE map. Named themes (THEMES) share
 * a second version-keyed table the same way.
 */
import type { Mark, ThemeTokens } from "./types.ts";

// ponytail: kept in sync with package.json by hand; test/registry.test.ts fails when it drifts.
export const VERSION = "0.17.1";
// ponytail: keyed by major; pre-1.0 Mark-contract breaks must bump this by hand.
export const MAJOR = "0";

const KEY = Symbol.for("mayacharts.marks@" + MAJOR);
if (!Object.hasOwn(globalThis, KEY))
  Object.defineProperty(globalThis, KEY, { value: new Map<string, Mark>() });

/** type -> Mark for every registered module type (shared across bundles). */
export const MODULES = (globalThis as unknown as Record<symbol, Map<string, Mark>>)[KEY]!;

/** Types that ship in core (static CORE map in render.ts). */
export const CORE_TYPES = [
  "bar",
  "line",
  "area",
  "scatter",
  "heatmap",
  "waterfall",
  "kpi",
  "dumbbell",
  "ridgeline",
  "beeswarm",
  "parallel",
  "table",
  "list",
] as const;

/** Module types and the import that provides them (for the unknown-type hint). */
export const MODULE_OF: Readonly<Record<string, string>> = {
  treemap: "hierarchy",
  sunburst: "hierarchy",
  marimekko: "hierarchy",
  waffle: "hierarchy",
  sankey: "flow",
  chord: "flow",
  radial: "radial",
  gauge: "radial",
  hexmap: "geo",
  boxplot: "stats",
  funnel: "stats",
  weave: "weave",
  units: "units",
  orbit: "orbit",
  constellation: "constellation",
};

const TK = Symbol.for("mayacharts.themes@" + MAJOR);
if (!Object.hasOwn(globalThis, TK))
  Object.defineProperty(globalThis, TK, { value: new Map<string, ThemeTokens>() });

/** Named themes for `spec.theme: "name"` (shared across bundles like MODULES). */
export const THEMES = (globalThis as unknown as Record<symbol, Map<string, ThemeTokens>>)[TK]!;

/** Adds named themes (validate.ts registerTheme checks them first; themes.ts adds its own with
 * keep, so a name the host registered first stays). Connected charts re-render. */
export function addThemes(t: Readonly<Record<string, ThemeTokens>>, keep = false): void {
  for (const [k, v] of Object.entries(t)) if (!keep || !THEMES.has(k)) THEMES.set(k, v);
  if (typeof globalThis.dispatchEvent === "function")
    globalThis.dispatchEvent(new Event("maya-register"));
}

/** Not exported from the public entry: modules call it on import. First wins. */
export function register(type: string, mark: Mark): void {
  if (!MODULES.has(type)) MODULES.set(type, mark);
  // Connected <maya-chart>s re-render on this, so late module loads fix "unknown type".
  if (typeof globalThis.dispatchEvent === "function")
    globalThis.dispatchEvent(new Event("maya-register"));
}

/** Registered module types. */
export const types = (): string[] => [...MODULES.keys()];
