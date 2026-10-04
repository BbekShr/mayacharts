import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  snapshotPathTemplate: "e2e/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { baseURL: "http://localhost:4173/mayacharts/" },
  // E2E_NO_SERVER=1: for specs that never navigate to the site (global, csp).
  ...(process.env.E2E_NO_SERVER
    ? {}
    : {
        webServer: {
          command:
            "npm run site:build && npx vite preview --config site/vite.config.ts --port 4173 --strictPort",
          url: "http://localhost:4173/mayacharts/",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
  // compare.spec.ts only runs in its own project (`npm run compare`).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: "**/compare.spec.ts" },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testIgnore: "**/compare.spec.ts" },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testIgnore: "**/compare.spec.ts" },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
      testMatch: ["**/interactions.spec.ts"],
    },
    {
      name: "compare",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/compare.spec.ts"],
    },
  ],
});
