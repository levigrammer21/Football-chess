import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react(), {
    name: "source-entry",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/" || req.url === "/index.html") req.url = "/app.html";
        next();
      });
    },
  }],
  publicDir: false,
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "app.html",
      output: {
        entryFileNames: "game.js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  server: { host: "0.0.0.0" },
});
