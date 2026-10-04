// Authoring cost per ref: lexical tokens and non-blank lines. Writes site/compare-ease.json.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REF = "e2e/compare/ref";
const definition =
  "Tokens count identifiers, keywords, numbers, strings, template literals, JSX text runs and each punctuator once; comments and whitespace are free; lines exclude blank ones.";
// Order matters: comments, strings, templates (no nesting), JSX text between > and <, numbers, words, then one punctuator each.
const LEX =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(`(?:\\.|[^`\\])*`)|>[^<>{}]*[^\s<>{}][^<>{}]*(?=<)|\d[\d_.]*(?:e[+-]?\d+)?|[\w$]+|=>|\.\.\.|[=!]==?|[<>]=?|&&|\|\||\?\?|\?\.|\+\+|--|[^\s]/g;
const count = (src) => {
  let tokens = 0;
  for (const m of src.matchAll(LEX))
    if (!m[0].startsWith("//") && !m[0].startsWith("/*"))
      tokens += m[0].startsWith(">") && m[0].length > 1 ? 2 : 1;
  return { tokens, lines: src.split("\n").filter((l) => l.trim()).length };
};
const libs = {};
for (const d of readdirSync(REF, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const lib = (libs[d.name] = {});
  const total = { tokens: 0, lines: 0, charts: 0 };
  for (const f of readdirSync(join(REF, d.name))
    .filter((f) => /\.jsx?$/.test(f))
    .sort()) {
    const src = readFileSync(join(REF, d.name, f), "utf8");
    const c = /^export const unsupported\b/m.test(src) ? null : count(src);
    lib[f.replace(/\.jsx?$/, "")] = c;
    if (c) ((total.tokens += c.tokens), (total.lines += c.lines), total.charts++);
  }
  lib.total = total;
}
const out = { generated: new Date().toISOString().slice(0, 10), definition, libs };
writeFileSync("site/compare-ease.json", JSON.stringify(out, null, 2) + "\n");
console.log(
  Object.entries(libs)
    .map(([k, v]) => `${k} ${JSON.stringify(v.total)}`)
    .join("\n"),
);
