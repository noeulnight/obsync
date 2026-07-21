import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/.pnpm/@codemirror+")) return "codemirror";
        },
      },
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["mac.lab"],
    proxy: {
      "/api": "http://localhost:3000",
      "/collaboration": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
