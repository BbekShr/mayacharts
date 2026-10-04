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
      { find: /^mayacharts\/hierarchy$/, replacement: src("hierarchy.ts") },
      { find: /^mayacharts\/flow$/, replacement: src("flow.ts") },
      { find: /^mayacharts\/geo$/, replacement: src("geo.ts") },
      { find: /^mayacharts$/, replacement: src("index.ts") },
    ],
  },
  plugins: [
    {
      // package.json "sideEffects" lists dist side-effect files, so bare imports were tree-shaken
      // and the modules never registered.
      name: "keep-side-effects",
      enforce: "pre",
      // Vite's alias plugin has already rewritten the id to the absolute path by the time this runs.
      async resolveId(id, importer, opts) {
        const sideEffectPattern = /^mayacharts\/(element|hierarchy|flow|geo)$/;
        const srcFiles = [src("element.ts"), src("hierarchy.ts"), src("flow.ts"), src("geo.ts")];
        if (!sideEffectPattern.test(id) && !srcFiles.includes(id)) return null;
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
        gallery: `${here}gallery.html`,
      },
    },
  },
});
