#!/usr/bin/env node

import { readFileSync, statSync, existsSync } from "fs";
import { gzipSync } from "zlib";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

// Read package.json
const packageJsonPath = `${projectRoot}/package.json`;
let packageJson;
try {
  packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
} catch (e) {
  console.error(`Error reading ${packageJsonPath}:`, e.message);
  process.exit(1);
}

const mayaSize = packageJson.mayaSize;
if (!mayaSize || typeof mayaSize !== "object") {
  console.error("No mayaSize field found in package.json");
  process.exit(1);
}

const files = Object.entries(mayaSize);
if (files.length === 0) {
  console.error("mayaSize field is empty in package.json");
  process.exit(1);
}

let hasError = false;
const rows = [];
let totalGzip = 0;

// Process each file
for (const [filePath, budget] of files) {
  const fullPath = `${projectRoot}/${filePath}`;

  if (!existsSync(fullPath)) {
    if (!process.env.MAYA_SIZE_PARTIAL) {
      console.error(`Error: File not found: ${filePath}`);
      hasError = true;
    }
    continue;
  }

  const buffer = readFileSync(fullPath);
  const content = buffer.toString("utf-8");

  // Check banner on all JS files
  if (filePath.endsWith(".js")) {
    if (!content.startsWith("/*! mayacharts")) {
      console.error(`Error: ${filePath} does not start with banner "/*! mayacharts"`);
      hasError = true;
    }
  }

  // Check for top-level var maya or const maya in global build
  if (filePath === "dist/maya.global.js") {
    const first200 = content.substring(0, 200);
    if (/^\s*(var|const)\s+maya\s*[=;]/.test(first200)) {
      console.error(`Error: ${filePath} has top-level var maya or const maya declaration`);
      hasError = true;
    }
  }

  const rawBytes = buffer.length;
  const gzipBytes = gzipSync(buffer, { level: 9 }).length;

  const rawSize = formatBytes(rawBytes);
  const gzipSize = formatBytes(gzipBytes);
  const budgetSize = formatBytes(budget);
  const status = gzipBytes > budget ? "OVER" : "ok";

  if (gzipBytes > budget) {
    hasError = true;
  }

  rows.push({
    file: filePath,
    raw: rawSize,
    gzip: gzipSize,
    budget: budgetSize,
    status,
  });

  totalGzip += gzipBytes;
}

// Print table
const fileColWidth = Math.max(4, Math.max(...rows.map((r) => r.file.length)));
const rawColWidth = Math.max(3, Math.max(...rows.map((r) => r.raw.length)));
const gzipColWidth = Math.max(4, Math.max(...rows.map((r) => r.gzip.length)));
const budgetColWidth = Math.max(6, Math.max(...rows.map((r) => r.budget.length)));
const statusColWidth = 6;

console.log(
  `${"File".padEnd(fileColWidth)}  ${"Raw".padStart(rawColWidth)}  ${"Gzip".padStart(gzipColWidth)}  ${"Budget".padStart(budgetColWidth)}  Status`,
);
console.log(
  `${"-".repeat(fileColWidth)}  ${"-".repeat(rawColWidth)}  ${"-".repeat(gzipColWidth)}  ${"-".repeat(budgetColWidth)}  ${"-".repeat(statusColWidth)}`,
);

for (const row of rows) {
  console.log(
    `${row.file.padEnd(fileColWidth)}  ${row.raw.padStart(rawColWidth)}  ${row.gzip.padStart(gzipColWidth)}  ${row.budget.padStart(budgetColWidth)}  ${row.status}`,
  );
}

console.log(
  `${"-".repeat(fileColWidth)}  ${"-".repeat(rawColWidth)}  ${"-".repeat(gzipColWidth)}  ${"-".repeat(budgetColWidth)}  ${"-".repeat(statusColWidth)}`,
);

const totalGzipSize = formatBytes(totalGzip);
console.log(
  `${"TOTAL".padEnd(fileColWidth)}  ${"".padStart(rawColWidth)}  ${totalGzipSize.padStart(gzipColWidth)}  ${"".padStart(budgetColWidth)}`,
);

// Write to GITHUB_STEP_SUMMARY if set
if (process.env.GITHUB_STEP_SUMMARY) {
  const markdownTable = buildMarkdownTable(rows, totalGzipSize);
  try {
    const existing = readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf-8");
    const content = existing + "\n" + markdownTable;
    readFileSync(process.env.GITHUB_STEP_SUMMARY, "utf-8");
  } catch (e) {
    // File doesn't exist, create it
  }

  const fs = await import("fs").then((m) => m.promises);
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdownTable + "\n");
}

if (hasError) {
  process.exit(1);
}

process.exit(0);

function formatBytes(bytes) {
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

function buildMarkdownTable(rows, totalGzipSize) {
  let table = "| File | Raw | Gzip | Budget | Status |\n";
  table += "|------|-----|------|--------|--------|\n";

  for (const row of rows) {
    table += `| ${row.file} | ${row.raw} | ${row.gzip} | ${row.budget} | ${row.status} |\n`;
  }

  table += `| TOTAL | | ${totalGzipSize} | | |\n`;
  return table;
}
