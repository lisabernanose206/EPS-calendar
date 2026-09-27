import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  workers: 1,
  timeout: 15000,
  expect: { timeout: 2000 },
  reporter: [["line"], ["json", { outputFile: fileURLToPath(new URL("./results/browser.json", import.meta.url)) }]],
  outputDir: fileURLToPath(new URL("./results/browser-artifacts", import.meta.url)),
  use: {
    baseURL: "http://127.0.0.1:5182",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5182 --strictPort",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:5182",
    reuseExistingServer: false
  }
});
