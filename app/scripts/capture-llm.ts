import path from "node:path";
import { createLlmProvider } from "@/server/llm";
import { loadServerEnv } from "@/server/env";
import { createRecordingFetch } from "@/test/recording-fetch";
import { scenarios } from "./capture-scenarios";

const CAPTURE_ROOT = path.resolve(
  import.meta.dirname,
  "../tests/fixtures/llm-captures",
);

async function main(): Promise<number> {
  const requested = process.argv.slice(2);
  const unknown = requested.filter(
    (name) => !scenarios.some((s) => s.name === name),
  );
  if (unknown.length > 0) {
    console.error(
      `Unknown scenario(s): ${unknown.join(", ")}. Known: ${scenarios.map((s) => s.name).join(", ") || "(none)"}`,
    );
    return 1;
  }
  const selected =
    requested.length > 0
      ? scenarios.filter((s) => requested.includes(s.name))
      : scenarios;
  if (selected.length === 0) {
    console.log("No capture scenarios registered yet (T32-T34 add them).");
    return 0;
  }

  const env = loadServerEnv();
  let failures = 0;
  for (const scenario of selected) {
    const recorder = createRecordingFetch({
      dir: path.join(CAPTURE_ROOT, scenario.dir),
      name: scenario.name,
      meta: {
        endpoint: scenario.endpoint,
        modelId: scenario.modelId(env),
        promptVersion: scenario.promptVersion,
        requestSummary: scenario.requestSummary,
        scenario: scenario.name,
      },
      onCaptured: ({ status, file }) =>
        console.log(
          `${scenario.name}: HTTP ${status} -> ${path.relative(process.cwd(), file)}`,
        ),
    });
    try {
      const provider = createLlmProvider({
        apiKey: env.openrouterApiKey,
        fetch: recorder,
      });
      await scenario.run(provider, env);
    } catch (error) {
      // The exchange is still recorded (error captures are wanted); never print request data.
      console.log(
        `${scenario.name}: run ended with ${error instanceof Error ? error.name : "error"}`,
      );
    }
    await recorder.flush();
    if (recorder.files.length === 0) {
      console.error(`${scenario.name}: no request was made`);
      failures += 1;
    }
  }
  return failures > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "capture failed",
    );
    process.exit(1);
  },
);
