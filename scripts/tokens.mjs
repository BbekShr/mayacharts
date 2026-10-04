#!/usr/bin/env node
// Claude token spend on this project, from the Claude Code transcripts in ~/.claude/projects.
// Claude Code deletes old transcripts (cleanupPeriodDays, default 30), so per-session totals are
// kept in .claude/tokens.json (gitignored) and a session that vanished keeps its last count.
// Known gap: a forked or resumed-into-new-file session counts its copied turns twice once the
// parent transcript is deleted.

// `--readme` also rewrites the block between the tokens markers in README.md (the pre-commit hook
// in .githooks runs it).

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { dirname, join, relative, resolve } from "path";

// The main checkout, also when run from a worktree: its sessions are logged under the main repo.
const root = dirname(
  resolve(execSync("git rev-parse --git-common-dir", { encoding: "utf8" }).trim()),
);
const dir = join(homedir(), ".claude/projects", root.replace(/[^a-zA-Z0-9]/g, "-"));
const ledgerPath = join(root, ".claude/tokens.json");
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : {};

const files = existsSync(dir)
  ? readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".jsonl"))
  : [];
const seen = new Set();
for (const f of files) {
  const session = {};
  for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
    if (!line.includes('"usage"')) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const m = e.message;
    // One API response is logged once per content block; count it once.
    if (!m?.usage || !m.id || seen.has(m.id) || m.model === "<synthetic>") continue;
    seen.add(m.id);
    const u = m.usage;
    const s = (session[m.model] ??= { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
    s.calls++;
    s.input += u.input_tokens ?? 0;
    s.cacheWrite += u.cache_creation_input_tokens ?? 0;
    s.cacheRead += u.cache_read_input_tokens ?? 0;
    s.output += u.output_tokens ?? 0;
    const day = e.timestamp?.slice(0, 10);
    if (day) (session.days ??= {})[day] = (session.days[day] ?? 0) + 1;
  }
  ledger[relative(dir, join(dir, f))] = session;
}
writeFileSync(ledgerPath, JSON.stringify(ledger) + "\n");

const byModel = {};
const days = new Set();
for (const session of Object.values(ledger)) {
  for (const [model, s] of Object.entries(session)) {
    if (model === "days") {
      Object.keys(s).forEach((d) => days.add(d));
      continue;
    }
    const t = (byModel[model] ??= { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
    for (const k in t) t[k] += s[k];
  }
}

const n = (x) => x.toLocaleString("en-US");
const cols = ["calls", "input", "cacheWrite", "cacheRead", "output", "total"];
const rows = Object.entries(byModel).map(([model, t]) => ({
  model,
  ...t,
  total: t.input + t.cacheWrite + t.cacheRead + t.output,
}));
const sum = { model: "all" };
for (const c of cols) sum[c] = rows.reduce((a, r) => a + r[c], 0);
rows.sort((a, b) => b.total - a.total).push(sum);

const sorted = [...days].sort();
console.log(
  `Claude tokens on ${root.split("/").pop()}: ${Object.keys(ledger).length} transcripts, ` +
    `${sorted[0] ?? "-"} to ${sorted.at(-1) ?? "-"} (${days.size} active days)\n`,
);
const table = [["model", ...cols], ...rows.map((r) => [r.model, ...cols.map((c) => n(r[c]))])];
const w = table[0].map((_, i) => Math.max(...table.map((r) => r[i].length)));
for (const r of table)
  console.log(r.map((v, i) => (i ? v.padStart(w[i]) : v.padEnd(w[i]))).join("  "));

// A clone with no sessions of its own must not overwrite the count with zeros.
if (process.argv.includes("--readme") && sum.calls > 0) {
  const lines = rows.map((r) => `- ${r.model}: ${n(r.total)} total, ${n(r.output)} output`);
  const block =
    `<!-- tokens:start -->\n\nTokens spent with Claude Code since the first commit, across ${n(sum.calls)} ` +
    `API calls. Most are cached context re-read on each turn. Updated on every commit by ` +
    `\`npm run tokens -- --readme\`.\n\n${lines.join("\n")}\n\n<!-- tokens:end -->`;
  const readme = readFileSync("README.md", "utf8");
  writeFileSync(
    "README.md",
    readme.replace(/<!-- tokens:start -->[\s\S]*<!-- tokens:end -->/, block),
  );
}
