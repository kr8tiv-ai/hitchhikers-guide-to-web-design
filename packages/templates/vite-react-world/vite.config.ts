import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
        credits: path.resolve(root, "credits.html"),
        world: path.resolve(root, "world.html"),
      },
    },
  },
});
