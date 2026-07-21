import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["cjs"],
      fileName: () => "main.js",
    },
    outDir: ".",
    emptyOutDir: false,
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
