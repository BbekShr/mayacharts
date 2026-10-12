import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { KEYS, TOKENS } from "../src/core/validate.ts";
import { CORE_TYPES, MODULE_OF } from "../src/core/registry.ts";
import { TEXT } from "../src/core/strings.ts";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const README = read("README.md");
const DOCS = read("site/docs.html");
const LLMS = read("llms.txt");

/** Whole-word match, so "x" does not pass because "max" exists. */
const has = (doc: string, word: string) =>
  new RegExp(`(?<![\\w-])${word.replace(/[$]/g, "\\$&")}(?![\\w-])`).test(doc);
const missing = (doc: string, words: string[]) => words.filter((w) => !has(doc, w));

const types = [...CORE_TYPES, ...Object.keys(MODULE_OF)];
const errors = [
  ...read("src/core/types.ts")
    .match(/export type ErrorCode =([^;]+);/)![1]!
    .matchAll(/"([\w-]+)"/g),
].map((m) => m[1]!);
const events = [
  ...new Set(
    readdirSync(new URL("../src/element", import.meta.url))
      .flatMap((f) => [
        ...read(`src/element/${f}`).matchAll(
          /"(maya-(?:render|settled|error|select|view|drill-leaf))"/g,
        ),
      ])
      .map((m) => m[1]!),
  ),
];
const pkg = JSON.parse(read("package.json")) as { exports: Record<string, unknown> };
const entries = Object.entries(pkg.exports)
  // schema.json and the global build are files, not imports; "./jsx" is types only and its .d.ts is not emitted
  .filter(
    ([k, v]) =>
      !k.includes("global") &&
      !k.endsWith(".json") &&
      !(typeof v === "object" && !("default" in v!)),
  )
  .map(([k]) => (k === "." ? "mayacharts" : `mayacharts/${k.slice(2)}`));
const globals = [
  "maya.global.js",
  ...readdirSync(new URL("../src", import.meta.url))
    .filter((f) => f.startsWith("global-"))
    .map((f) => `maya.${f.slice(7, -3)}.global.js`),
];
const element = [
  "settled",
  "renderShell",
  "SRI",
  "Trusted Types",
  "maya.host.thoughtspot",
  "maya.host.columns",
];

describe("docs cover the whole surface", () => {
  const docs: [string, string, boolean][] = [
    ["README.md", README, false],
    ["site/docs.html", DOCS, true],
    ["llms.txt", LLMS, true],
  ];
  for (const [name, doc, deep] of docs) {
    it(`${name} names every key, type, event, error code, entry point and file`, () => {
      const gaps = {
        keys: missing(doc, KEYS),
        types: missing(doc, types),
        events: missing(doc, events),
        errors: missing(doc, errors),
        entries: missing(doc, entries),
        element: missing(doc, element),
        globals: globals.filter((g) => !doc.includes(g)),
        text: deep ? missing(doc, Object.keys(TEXT)) : [],
        tokens: deep ? missing(doc, TOKENS) : [],
      };
      expect(events.length).toBe(6);
      expect(gaps).toEqual(Object.fromEntries(Object.keys(gaps).map((k) => [k, []])));
    });
  }

  it("errors.html has an anchor for every error code", () => {
    const html = read("site/errors.html");
    expect(errors.filter((c) => !html.includes(`id="${c}"`))).toEqual([]);
  });
});
