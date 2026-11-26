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

- Key check (`GET /api/v1/key`): HTTP 200, run by the reviewer on 2026-11-26 (plan T00). The key is a test key, stored only in the gitignored `app/.env.local`.
- Decisions model listing (`typesafe/jev-1.14`, image input; `GET /api/v1/models?output_modalities=decisions&input_modalities=image`): not obtainable from the agent sandbox (the fetch tool returned an unrelated proxy listing, discarded). Superseded by the real call below.
- First real screening capture accepted with the normalized wire format and `data_collection: deny` (ADR-003 TAC-003-07): **yes**, 2026-11-26, `screening/screening-phone-1-return.json`: HTTP 200, response `model: typesafe/jev-1.14-20261014`, `provider: TypeSafe`, answer types `choice`/`noul`/`score`. With a BYOK key `usage.cost` is 0 and the upstream cost is in `usage.cost_details.upstream_inference_cost`.
- LLM capabilities (`openai/gpt-6-luna`), verified by real calls on 2026-11-26 with `data_collection: deny` and `require_parameters: true`: plain text 200 (Azure), `response_format: json_schema` 200 (Azure), image input 200 (Azure), `response_format: json_object` 200 (Amazon Bedrock); **`temperature` → 404 "No endpoints found that can handle the requested parameters" (failed step "Filter by Parameters")**, so the app sends no `temperature` (ADR-003 §3.4). Tools: real chat captures contain a `changeDecision` tool call (Azure).

## Captures

Recorded 2026-11-26 with `npm run capture:llm` (ai 7.0.183, @openrouter/ai-sdk-provider 3.1.0, prompt version 2026-11-26.1):

- `screening/`: 5 photos × 2 case types (HTTP 200, `typesafe/jev-1.14`), `screening-error-invalid-key` (real 401), `screening-error-unknown-model` (real 400). No refusal could be provoked: the refusal path is a coverage gap (plan §7a.4).
- `decision/`: escalated return with description (R6), complaint (R10), llm-always R1 explain-only, and `decision-return-invalid-first` + `-2` (two real answers that fail validation against a deliberately narrowed rule-ID set → corrective retry, then `llm_failed`).
- `chat/` (raw SSE): purchase-date question, new fact → `changeDecision` tool call + follow-up step (`-2`), pressure, off-topic.
