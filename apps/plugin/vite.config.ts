import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const pluginRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: pluginRoot,
  plugins: [
    {
      name: "deploy-plugin-bundle",
      closeBundle() {
        copyFileSync(new URL("dist/main.js", import.meta.url), new URL("main.js", import.meta.url));
      },
    },
  ],
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    outDir: "dist",
    sourcemap: "inline",
    rollupOptions: {
      external: [
        "obsidian",
        "electron",
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/search",
        "@codemirror/autocomplete",
        "@codemirror/lint",
        "@codemirror/collab",
      ],
      output: { exports: "default" },
    },
  },
});
