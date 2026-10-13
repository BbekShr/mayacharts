import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import schema from "../schema.json" with { type: "json" };
import { CORE_TYPES, MODULE_OF } from "../src/core/registry.ts";
import { ONLY, TOKENS } from "../src/core/validate.ts";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const readme = read("README.md");
const llms = read("llms.txt");
const errors = read("site/errors.html");
const index = read("site/index.html");
const TYPES = [...CORE_TYPES, ...Object.keys(MODULE_OF)];
const words = (s: string) => [...new Set(s.match(/\w+/g))].sort();
const only = (k: string) => [...ONLY[k]!].sort();

describe("docs state what the code says", () => {
  it("type counts in README and the home page", () => {
    // ponytail: the counts are spelled out as words, so a new type fails here until the prose follows.
    expect(TYPES).toHaveLength(28);
    expect(CORE_TYPES).toHaveLength(13);
    expect(Object.keys(MODULE_OF)).toHaveLength(15);
    for (const s of ["Twenty-eight chart types", "Show all 28 specs", "Thirteen chart types with"])
      expect(readme).toContain(s);
    expect(index).toContain("<strong>28</strong>");
    expect(index).toContain("fifteen are optional modules");
  });
  it("README module table equals MODULE_OF", () => {
    const rows = [...readme.matchAll(/^\| `mayacharts\/(\w+)`\s*\| ([^|]+)\|/gm)];
    const got = rows.flatMap(([, m, ts]) =>
      ts!
        .replace(/\(.*?\)/g, "")
        .split(",")
        .map((t) => `${t.trim().split(" ")[0]}:${m}`),
    );
    const want = Object.entries(MODULE_OF).map(([t, m]) => `${t}:${m}`);
    expect(got.sort()).toEqual(want.sort());
  });
  it("per-option type lists equal ONLY in README and llms.txt", () => {
    const pick = (s: string) => words(s).filter((w) => TYPES.includes(w));
    for (const k of ["sort", "limit", "select", "colorBy", "path", "endLabels"]) {
      const row = readme.split("\n").find((l) => l.startsWith(`| \`${k}\``))!;
      const line = llms.split("\n").find((l) => l.startsWith(`${k}:`))!;
      expect(pick(row.split("|")[3]!), `README ${k}`).toEqual(only(k));
      expect(pick(line), `llms.txt ${k}`).toEqual(only(k));
    }
  });
  it("theme tokens agree in errors.html, llms.txt and schema.json", () => {
    expect([...schema.properties.theme.propertyNames.enum].sort()).toEqual([...TOKENS].sort());
    const sec = errors.split('id="invalid-theme"')[1]!.split("</section>")[0]!;
    const line = llms.split("\n").find((l) => l.startsWith("theme:"))!;
    for (const t of TOKENS.filter((t) => !t.startsWith("series"))) {
      expect(words(sec), `errors.html ${t}`).toContain(t);
      expect(words(line), `llms.txt ${t}`).toContain(t);
    }
  });
  it("errors.html has one section per ErrorCode", () => {
    const union = read("src/core/types.ts").split("export type ErrorCode =")[1]!.split(";")[0]!;
    const codes = [...union.matchAll(/"([\w-]+)"/g)].map((m) => m[1]!).sort();
    const ids = [...errors.matchAll(/<section id="([\w-]+)"/g)].map((m) => m[1]!).sort();
    expect(ids).toEqual(codes);
  });
});
