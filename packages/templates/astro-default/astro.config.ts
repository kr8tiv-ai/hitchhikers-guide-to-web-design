import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [react()],
  trailingSlash: "never",
  build: {
    inlineStylesheets: "always",
  },
});
