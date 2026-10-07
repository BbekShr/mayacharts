// IIFE entry (dist/maya.global.js): element + every module, exposed as globalThis.maya.
import * as maya from "./element.ts";
import "./hierarchy.ts";
import "./flow.ts";
import "./geo.ts";
import "./radial.ts";
import "./stats.ts";

(globalThis as { maya?: typeof maya }).maya = maya;

export {};
