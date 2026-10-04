import { defineConfig, type LibraryFormats } from "vite";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { css } from "./src/styles/theme.ts";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const modeToEntry = {
  index: "src/index.ts",
  element: "src/element.ts",
  hierarchy: "src/hierarchy.ts",
  flow: "src/flow.ts",
  geo: "src/geo.ts",
  global: "src/global.ts",
};

export default defineConfig(({ mode }) => {
  const entry = modeToEntry[mode as keyof typeof modeToEntry] || modeToEntry.index;
  const isGlobal = mode === "global";
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
          if (isGlobal) return "maya.global.js";
          const names: Record<string, string> = {
            index: "index.js",
            element: "element.js",
            hierarchy: "hierarchy.js",
            flow: "flow.js",
            geo: "geo.js",
          };
          return names[mode] || "index.js";
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
          const jsFiles = [
            "index.js",
            "element.js",
            "hierarchy.js",
            "flow.js",
            "geo.js",
            "maya.global.js",
          ];

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
