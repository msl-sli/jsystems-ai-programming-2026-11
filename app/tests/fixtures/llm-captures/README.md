# OpenRouter captures

Real OpenRouter exchanges, recorded once and replayed verbatim by unit and integration tests
(`createReplayFetch` in `src/test/replay-fetch.ts`). Nothing here is written by hand: no capture, no test
(plan section 7a). Missing responses are reported as coverage gaps, never invented.

## Files

One capture is a pair in a scenario sub-directory (`screening/`, `decision/`, `chat/`, `errors/`):

- `<name>.json`: `{ request: { method, url, headers, bodySha256, bodySummary? }, response: { status, statusText, headers, body, chunks? } }`.
  `authorization`, `cookie` and `x-api-key` request headers are stored as `"[redacted]"`; the request body is never
  stored, only its SHA-256. `body` is the raw response text; for SSE it is the raw byte stream decoded as UTF-8.
  `chunks` holds the chunk boundaries as received (their concatenation equals `body`) and is replayed as a stream.
- `<name>.meta.json`: `{ capturedAt, endpoint, modelId, provider?, providerHeaders?, packages: { ai, "@openrouter/ai-sdk-provider" }, promptVersion, requestSummary, scenario, matchBody? }`.
  `requestSummary` contains no customer text, image bytes or secrets. `matchBody: false` makes replay skip the body hash check.

A second request inside one scenario is stored as `<name>-2.json`, `<name>-3.json`, and so on.
`src/test/llm-captures-metadata.test.ts` fails on a capture without complete meta, on an orphan meta, and on any key
or unredacted authorization value.

## Recording

Needs `app/.env.local` with `OPENROUTER_API_KEY`, `LLM_MODEL`, `DECISIONS_MODEL` (only the orchestrator runs this; it costs money):

```
npm run capture:llm              # every registered scenario
npm run capture:llm -- <name>    # selected scenarios
```

Scenarios live in `scripts/capture-scenarios.ts` and send requests through the real request builders; each response
(including real 401/400/404 errors) is stored verbatim. The command prints one line per capture: scenario, HTTP status, file.

## Replaying

```ts
const replay = createReplayFetch({ captures: [path1, path2], delayMs: 0 });
const provider = createLlmProvider({ apiKey: "unused", fetch: replay });
// ... run the service ...
replay.assertAllConsumed();
```

Captures are served strictly in order and must match method, URL path and request body hash. A mismatch, an
exhausted list or a capture without meta throws; the helper never reaches the network and never changes status,
headers or body. `delayMs` delays the response (timeout tests) and honors `AbortSignal`.

## Freshness rule (plan section 7a.5)

Re-record captures when a prompt version, a model ID or an AI package version (`ai`,
`@openrouter/ai-sdk-provider`) changes. Tests compare capture metadata with the current prompt versions (ADR-000 TAC-05).

## T00 model verification

Filled in by the orchestrator.

- Key check (`GET /api/v1/key`): _pending_
- Decisions model listing (`openai/gpt-6-luna-decisions`, image input): _pending_
- LLM capabilities (`openai/gpt-6-luna`: image input, `structured_outputs`, `tools`): _pending_

## Captures

_None recorded yet._
