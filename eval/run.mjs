#!/usr/bin/env node
// LLM eval: can a model write a working chart from a prompt and a table?
//
//   node eval/run.mjs [prompts.jsonl] [--model claude-sonnet-5-5] [--limit N] [--dry]
//
// Each line of the prompts file is { id, prompt, columns: [{name, type}], rows: [...] }.
// For every prompt the model is asked twice: once for a mayaCharts spec (llms.txt as the cached
// system context) and once for ECharts options (a short fixed system prompt, no docs). Answers
// are scored by eval/score.ts. This calls the paid API, so run it on purpose. `--dry` makes no
// API call: it scores the `canned` answers stored in the prompts file and writes nothing.
// Needs `npm run build` first (it renders with dist/index.js) and ANTHROPIC_API_KEY unless --dry.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { score, summarize } from "./score.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i < 0 ? dflt : (args[i + 1] ?? dflt);
};
const dry = args.includes("--dry");
const model = flag("--model", "claude-sonnet-5-5");
const limit = Number(flag("--limit", "0")) || Infinity;
const valueFlags = new Set(["--model", "--limit"]);
const file =
  args.find((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1] ?? "")) ??
  "eval/prompts.jsonl";
const CONCURRENCY = 4;
const date = new Date().toISOString().slice(0, 10);

const prompts = readFileSync(resolve(file), "utf-8")
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .slice(0, limit);

const distIndex = resolve(root, "dist/index.js");
if (!existsSync(distIndex)) throw new Error("dist/index.js missing: run `npm run build` first");
const { validateSpec, render } = await import(pathToFileURL(distIndex).href);
const echarts = await import("echarts");
const libs = { validateSpec, render, echarts };

const MAYA_SYSTEM = [
  "You write mayaCharts chart specs. Reply with one JSON object and nothing else: no prose, no code fence.",
  'Leave out "data": the host fills it with the table rows. Use the column names exactly as given.',
  "Reference documentation follows.",
].join("\n");
const ECHARTS_SYSTEM = [
  "You write Apache ECharts option objects. Reply with one JSON object and nothing else: no prose, no code fence.",
  'Use "dataset": {"source": []} with encode on each series. The host fills dataset.source with the table rows as objects keyed by column name.',
  "The option must be plain JSON: no functions.",
].join("\n");

const userMessage = (p) =>
  `${p.prompt}\n\nColumns:\n${p.columns.map((c) => `- ${c.name} (${c.type})`).join("\n")}\n\nFirst rows:\n${JSON.stringify(p.rows.slice(0, 5))}\n\nTotal rows: ${p.rows.length}`;

let ask;
if (!dry) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const llms = readFileSync(resolve(root, "llms.txt"), "utf-8");
  ask = async (library, p) => {
    const system =
      library === "mayacharts"
        ? [
            { type: "text", text: MAYA_SYSTEM },
            { type: "text", text: llms, cache_control: { type: "ephemeral" } },
          ]
        : ECHARTS_SYSTEM;
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userMessage(p) }],
    });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  };
} else {
  ask = async (library, p) => {
    const c = p.canned?.[library];
    if (c === undefined) throw new Error(`prompt ${p.id} has no canned answer for ${library}`);
    return typeof c === "string" ? c : JSON.stringify(c);
  };
}

const LIBRARIES = ["mayacharts", "echarts"];
const jobs = prompts.flatMap((p) => LIBRARIES.map((library) => ({ p, library })));
const results = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { p, library } = jobs[next++];
    let answer = "";
    let s;
    try {
      answer = await ask(library, p);
      s = score(library, answer, p.rows, libs);
    } catch (e) {
      // An API failure is not a model failure: record it and leave it out of the summary.
      results.push({ id: p.id, library, apiError: String(e?.message ?? e) });
      continue;
    }
    results.push({ id: p.id, library, ...s, answer });
    console.log(
      `${p.id} ${library}: json=${s.validJson} renders=${s.renders} nonBlank=${s.nonBlank}${s.error ? ` (${s.error})` : ""}`,
    );
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

const libraries = {};
for (const library of LIBRARIES)
  libraries[library] = {
    ...summarize(results.filter((r) => r.library === library && !r.apiError)),
    model: dry ? "dry" : model,
    date,
  };
const summary = { model: dry ? "dry" : model, date, n: prompts.length, libraries };
console.log(JSON.stringify(summary, null, 2));
const failed = results.filter((r) => r.apiError).length;
if (failed) console.warn(`${failed} API calls failed and are excluded from the summary`);

if (!dry) {
  results.sort((a, b) => a.id.localeCompare(b.id) || a.library.localeCompare(b.library));
  writeFileSync(
    resolve(root, `eval/results-${model}-${date}.json`),
    JSON.stringify({ ...summary, results }, null, 2) + "\n",
  );
  const cmp = resolve(root, "site/compare.json");
  const j = existsSync(cmp) ? JSON.parse(readFileSync(cmp, "utf-8")) : {};
  j.eval = summary;
  writeFileSync(cmp, JSON.stringify(j, null, 2) + "\n");
}
