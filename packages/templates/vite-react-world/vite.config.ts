import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Vite realpaths the project root. A Windows 8.3 short path (RUNNER~1) on these
// HTML inputs makes Rollup emit a ../ fileName and the build fails.
const root = fs.realpathSync.native(path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.join(root, "index.html"),
        credits: path.join(root, "credits.html"),
        world: path.join(root, "world.html"),
      },
    },
  },
});
