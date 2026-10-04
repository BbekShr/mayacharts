import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

export default defineConfig({
  root: here,
  base: "/mayacharts/",
  resolve: {
    alias: [
      { find: /^mayacharts\/element$/, replacement: src("element.ts") },
      { find: /^mayacharts$/, replacement: src("index.ts") },
    ],
  },
  plugins: [
    {
      // package.json "sideEffects" lists only dist/element.js, so the bare `import "mayacharts/element"`
      // (aliased to src/element.ts) was tree-shaken and the element never registered.
      name: "keep-element-side-effects",
      enforce: "pre",
      // Vite's alias plugin has already rewritten the id to the absolute path by the time this runs.
      async resolveId(id, importer, opts) {
        if (id !== "mayacharts/element" && id !== src("element.ts")) return null;
        const r = await this.resolve(id, importer, { ...opts, skipSelf: true });
        return r && { ...r, moduleSideEffects: true };
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: `${here}index.html`,
        errors: `${here}errors.html`,
        ssr: `${here}ssr.html`,
      },
    },
  },
});
