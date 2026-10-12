// IIFE entry (dist/maya.core.global.js): element, core types and maya.host as globalThis.maya.
import * as element from "./element.ts";
import * as host from "./host.ts";

(globalThis as { maya?: object }).maya = { ...element, host };

export {};
