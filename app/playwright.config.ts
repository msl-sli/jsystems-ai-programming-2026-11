import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: { baseURL },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      grepInvert: /@live/,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      grepInvert: /@live/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grepInvert: /@live/,
    },
    // Real OpenRouter calls (costs money): run only via `npm run test:e2e:live`.
    {
      name: "live",
      use: { ...devices["Desktop Chrome"] },
      grep: /@live/,
      default: false,
    },
  ],
});
