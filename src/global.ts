// IIFE entry (dist/maya.global.js): core global plus every module, and the named themes as maya.themes
// (importing themes.ts also registers them for theme: "name").
import "./global-core.ts";
import { themes } from "./themes.ts";
import "./hierarchy.ts";
import "./flow.ts";
import "./geo.ts";
import "./radial.ts";
import "./stats.ts";
import "./weave.ts";
import "./units.ts";
import "./orbit.ts";
import "./constellation.ts";

(globalThis as unknown as { maya: Record<string, unknown> }).maya.themes = themes;

export {};
