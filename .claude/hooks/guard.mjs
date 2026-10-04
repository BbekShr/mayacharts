#!/usr/bin/env node
// Two small guards, one file. Usage: guard.mjs gates | typecheck
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Files that define a quality gate. Editing them to make a check pass is the failure mode this
// blocks: fix the code instead. Size budgets in package.json are guarded by content, not file.
const PROTECTED = new Set([
  "tsconfig.json",
  "vitest.config.ts",
  "playwright.config.ts",
  "size.mjs",
  "theme.test.ts",
  ".prettierrc",
  ".prettierignore",
]);

function gates(input) {
  const t = input?.tool_input ?? {};
  const file = t.file_path;
  if (!file || !existsSync(file)) return 0; // creating a file is fine
  const name = basename(file);
  const budget =
    name === "package.json" && /mayaSize|"dist\//.test(`${t.old_string ?? ""}${t.content ?? ""}`);
  if (!PROTECTED.has(name) && !budget) return 0;
  process.stderr.write(
    `BLOCKED: ${budget ? "the mayaSize budgets in package.json are" : `${name} is`} a quality gate.\n` +
      "Fix the code so the existing gate passes. If the gate itself is wrong (or a budget must " +
      "rise), say so and ask the human before changing it.\n",
  );
  return 2;
}

const newest = (dir) => {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    n = Math.max(n, e.isDirectory() ? newest(p) : /\.ts$/.test(e.name) ? statSync(p).mtimeMs : 0);
  }
  return n;
};

function typecheck() {
  // In node_modules, not .git: in a worktree .git is a file.
  const stamp = join(ROOT, "node_modules", ".maya-typecheck-stamp");
  const last = existsSync(stamp) ? statSync(stamp).mtimeMs : 0;
  if (Math.max(newest(join(ROOT, "src")), newest(join(ROOT, "test"))) <= last) return 0;
  writeFileSync(stamp, ""); // stamp first: one nudge per edit batch, never a loop
  try {
    execFileSync("npm", ["run", "--silent", "typecheck"], { cwd: ROOT, stdio: "pipe" });
    return 0;
  } catch (err) {
    const out = String(err.stdout || "")
      .split("\n")
      .filter((l) => /error TS/.test(l))
      .slice(0, 20)
      .join("\n");
    process.stderr.write(`Type errors after your edits:\n${out}\n`);
    return 2;
  }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const mode = process.argv[2];
  let code = 0;
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    code = mode === "gates" ? gates(input) : typecheck();
  } catch (err) {
    // Never break the session, never fail silently either.
    process.stderr.write(`[guard ${mode}] skipped: ${err.message}\n`);
  }
  process.exit(code);
});
