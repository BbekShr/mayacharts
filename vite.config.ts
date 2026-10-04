import { defineConfig } from "vite";
import { css } from "./src/styles/theme.ts";

// Two builds so each entry is self-contained: `dist/index.js` is what SSR and the
// hosted render API pay for; `dist/element.js` is the single file a browser loads.
export default defineConfig(({ mode }) => {
  const element = mode === "element";
  return {
    build: {
      target: "es2022",
      minify: true,
      sourcemap: true,
      emptyOutDir: !element,
      lib: {
        entry: element ? "src/element.ts" : "src/index.ts",
        formats: ["es"],
        fileName: () => (element ? "element.js" : "index.js"),
      },
      // Library mode leaves ES output unminified by default; we ship it straight to browsers.
      rollupOptions: { output: { minify: true } },
    },
    plugins: element
      ? []
      : [
          {
            name: "maya-theme-css",
            generateBundle() {
              this.emitFile({ type: "asset", fileName: "theme.css", source: css });
            },
          },
        ],
  };
});
