import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.artifacts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
