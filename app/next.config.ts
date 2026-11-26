import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Prompt files are read from disk at runtime (server/ai/prompt-files); include them in the trace.
  outputFileTracingIncludes: {
    "/api/*": ["src/server/ai/prompts/**/*"],
  },
  turbopack: {
    // Intentional runtime file reads in server modules (prompts, policies from POLICIES_DIR,
    // which may lie outside app/). The warning concerns trace size for serverless output;
    // the PoC is deployed locally with `next start` only (ADR-000 "Local-only deployment").
    ignoreIssue: [
      {
        path: "**/src/server/**",
        title: /Dynamic filesystem access/,
      },
    ],
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
