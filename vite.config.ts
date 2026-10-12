import { defineConfig, type LibraryFormats } from "vite";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { css } from "./src/styles/theme.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const MODULES = [
  "hierarchy",
  "flow",
  "geo",
  "radial",
  "stats",
  "weave",
  "units",
  "orbit",
  "constellation",
];

const modeToEntry: Record<string, string> = {
  index: "src/index.ts",
  element: "src/element.ts",
  ...Object.fromEntries(MODULES.map((m) => [m, `src/${m}.ts`])),
  host: "src/host.ts",
  themes: "src/themes.ts",
  global: "src/global.ts",
  "global-core": "src/global-core.ts",
  ...Object.fromEntries(MODULES.map((m) => [`global-${m}`, `src/global-${m}.ts`])),
};

// classic-script IIFE builds: global -> maya.global.js, global-core -> maya.core.global.js
const globalFile = (mode: string) =>
  mode === "global" ? "maya.global.js" : `maya.${mode.slice(7)}.global.js`;

export default defineConfig(({ mode }) => {
  const entry = modeToEntry[mode] || modeToEntry.index!;
  const isGlobal = mode.startsWith("global");
  const isIndex = mode === "index" || !mode;

  return {
    build: {
      target: "es2022",
      minify: true,
      sourcemap: true,
      emptyOutDir: isIndex,
      lib: {
        entry,
        formats: (isGlobal ? ["iife"] : ["es"]) as LibraryFormats[],
        fileName: () => {
          if (isGlobal) return globalFile(mode);
          return mode in modeToEntry ? `${mode}.js` : "index.js";
        },
        ...(isGlobal ? { name: "maya" } : {}),
      },
      rollupOptions: {
        output: {
          minify: true,
        },
      },
    },
    plugins: [
      {
        name: "maya-banner",
        writeBundle(options) {
          const banner = `/*! mayacharts v${pkg.version} | MIT | https://github.com/BbekShr/mayacharts */\n`;
          const outDir = options.dir || "dist";
          const jsFiles = Object.keys(modeToEntry).map((m) =>
            m.startsWith("global") ? globalFile(m) : `${m}.js`,
          );

          for (const file of jsFiles) {
            const filePath = join(outDir, file);
            try {
              const content = readFileSync(filePath, "utf-8");
              if (!content.startsWith("/*!")) {
                writeFileSync(filePath, banner + content);
              }
            } catch (e) {
              // File doesn't exist in this build mode, skip
            }
          }
        },
      },
      ...(isIndex
        ? [
            {
              name: "maya-theme-css",
              generateBundle(this: {
                emitFile(f: { type: "asset"; fileName: string; source: string }): void;
              }) {
                this.emitFile({ type: "asset", fileName: "theme.css", source: css });
              },
            },
          ]
        : []),
    ],
  };
});
