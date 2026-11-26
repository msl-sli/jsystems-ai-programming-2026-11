import { defineConfig, devices } from "@playwright/test";

// Test-runner setting only (no app code path): lets E2E run beside another server on :3000.
const port = process.env.E2E_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: `npm run build && npx next start --port ${port}`,
    url: baseURL,
    // Never reuse a server for live runs that need their own mode or key (plan §7a, T61).
    reuseExistingServer:
      !process.env.CI && !process.env.DECISION_MODE && process.env.LIVE_INVALID_KEY_RUN !== "1",
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
