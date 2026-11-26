import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const src = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": src },
  },
  test: {
    // Pin the zone so date tests (DST weeks, local "today") are deterministic on any host.
    env: { TZ: "Europe/Warsaw" },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // Every `.ts` test under src/ and scripts/ runs in node; `.tsx` tests run in jsdom.
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        },
        // `server-only` throws outside the `react-server` condition. The alias is scoped to the
        // node project, because the `react-server` condition would change React's exports in jsdom.
        resolve: {
          alias: {
            "server-only": path.resolve(src, "test/server-only-empty.ts"),
          },
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          // Real example photos are decoded in jsdom; under CPU load (E2E running in parallel on
          // this 4-core VM) one upload test exceeded the 5 s default. Assertions are unchanged.
          testTimeout: 15_000,
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup-dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**", "src/test/**", "**/*.test.*"],
      thresholds: {
        "src/domain/**": { lines: 95, branches: 95, perFile: false },
        "**/domain/routing.ts": { branches: 100 },
        "**/domain/decision-rules.ts": { branches: 100 },
        "**/domain/dates.ts": { branches: 100 },
      },
    },
  },
});
