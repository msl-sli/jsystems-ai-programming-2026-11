# Implementation Plan — Hardware Service Decision Copilot (PoC)

> **Status: APPROVED by the reviewer on 2026-11-26.** Execution proceeds task by task; pushes, PRs, issue creation and merges still require the reviewer's explicit go-ahead per task. Open decisions in §10 remain open until answered.

| | |
|---|---|
| Plan ID | `hsdc-poc` (briefs: `docs/.agent-briefs/hsdc-poc-<task>.md`) |
| Date | 2026-11-26 |
| Orchestrator | Claude Opus 5.5 (this session) |
| Requirements | [`docs/PRD.md`](../PRD.md) (AC-01..AC-42) |
| Architecture | [`docs/ADR/000`](../ADR/000-main-architecture.md), [`001`](../ADR/001-frontend.md), [`002`](../ADR/002-backend-api.md), [`003`](../ADR/003-ai-decision-engine.md), [`004`](../ADR/004-project-initialization.md) |
| Design | [`docs/design-guidelines.md`](../design-guidelines.md), [`assets/design-tokens.json`](../../assets/design-tokens.json), [`assets/homepage.png`](../../assets/homepage.png) |
| Policies | [`docs/policies/return-policy.md`](../policies/return-policy.md), [`docs/policies/complaint-policy.md`](../policies/complaint-policy.md) |
| Repo rules | [`AGENTS.md`](../../AGENTS.md) (TDD, Manual QA, verification, commit rules) |

---

## 1. Baseline — what actually exists (inspected 2026-11-26)

| Item | Observed state |
|---|---|
| Branch / tree | `docs/design-system-header-shots`, clean working tree, **8 commits ahead of `origin/main`, not pushed** (PRD, ADRs, design system, policies, skills exist only locally) |
| Application | `app/` contains only `README.md` (course scaffold checklist). No `package.json`, no source, no tests, no entry points |
| Tests / commands | None exist; there is no application command to verify yet. Baseline failure: n/a (nothing to run) |
| Tooling verified | `node -v` → v24.22.3; `npm -v` → 11.19.1; `gh` 2.105.0 logged in as fork owner with `repo` scope, viewer permission ADMIN; `playwright-cli` in `~/.local/bin`; `npx` available |
| GitHub Issues | **Disabled** on the fork (`hasIssuesEnabled: false`). Reviewer chose: enable after plan approval |
| OpenCode | v1.19.6 at `~/.opencode/bin/opencode` (**not on `PATH`**); OpenRouter credential configured in OpenCode; models available include `openrouter/openai/gpt-6-luna`, `opencode/mimo-v2.6-flash-free`, `opencode/deepseek-v4.1-flash-free`. `openai/gpt-6-luna-decisions` is not listed by OpenCode (expected: it is a Decisions model, not a chat model) |
| Claude Code agents | No `.claude/agents/` roles exist. The Agent tool in this harness supports ad hoc subagents with `model: sonnet` / `haiku` → Sonnet 5.5 / Haiku 5.5 |
| OpenRouter key for the app | **Unverified.** Both attempts to test the key from the agent were blocked by permissions; the human must run the check (T00) |
| Model availability | **Unverified** for `openai/gpt-6-luna-decisions` (model page HTTP 404 during ADR research) — ADR-003 TAC-003-07 gate |

---

## 2. Working agreements

- **Branches & PRs** (reviewer decision, revised 2026-11-26):
  1. **Docs PR (T01):** new branch `docs/hsdc-prd-adr-plan` stacked on the design-system work (starts at `999885f` "Docs: add header and above-the-fold design screenshots"), containing exactly three elements: PRD (+ the policies it references), ADRs, and this plan. Built by cherry-picking `579ac60` (PRD, policies, docs README line), `1adc014` and `ab6852f` (ADRs), then committing the plan. Opened against `origin/design-system`.
  2. **Implementation:** the whole PoC is implemented **as one delivery** on `feature/hsdc-poc`, branched from `docs/hsdc-prd-adr-plan`, with **one final PR** (T65). Phases remain as internal checkpoints (verification + orchestrator review), not separate PRs.
  - Push and PR creation need explicit human approval each time (AGENTS.md: no push without request). All PRs target the fork (`origin`), never `upstream`.
  - The other local commits on `docs/design-system-header-shots` (`c7b09f4` icon font, `7f0f73c` skills, `af6468d` `.mcp.json`) are **not** part of the docs PR and stay on that branch untouched (see §10 decision 4).
- **Commits:** only the orchestrator stages, commits, switches branches. One task = one focused commit, format `Area: summary` (AGENTS.md Commit Rules), named paths only, ending with the Co-Authored-By line.
- **Checkout:** single checkout; parallel tasks only with disjoint editable files. No worktrees planned (no two tasks edit the same file concurrently).
- **Workers return diffs + evidence;** the orchestrator re-runs the relevant checks before committing. Workers cannot change scope or accept their own work.
- **Mocks:** unit/integration doubles for OpenRouter are HTTP-level replays of **real captured responses** (ADR-003 §8, AGENTS.md TDD rules). E2E and Manual QA use the real app and real OpenRouter calls, never mocks.
- **Logs:** worker logs go to `.agent-logs/` (gitignored). The plan is committed while work runs and deleted when the DoD is met. Briefs in `docs/.agent-briefs/` are **not** committed: the repository's `.gitignore` marks `.agent-briefs/` as private (see C14).
- **Tracking:** after approval, Issues are enabled and one issue per task is created; the issue number is written next to the task ID in §5 and in the session task list.

---

## 3. Contradictions and ambiguities found (PRD ↔ ADRs ↔ AGENTS.md ↔ plan)

Each item could stop an agent or leave it unsure. Proposed resolution in the last column; items marked **Decision needed** require the reviewer.

| # | Where | Issue | Proposed resolution |
|---|---|---|---|
| C1 | PRD §4.1 step 5, §10 diagram, §11.1, AC-16 vs ADR-003 §3.2–3.5 | PRD says every case's photo goes to a **multimodal model with case-type image-analysis instructions**; ADR-003 screens with Luna Decisions (one question set, case type passed as JSON) and may decide **without any LLM** (template route). AC-16 wording ("analyzed with the return image-analysis instructions") is not literally met on template routes | **Decision needed:** approve a PRD amendment (T02) that describes the screening stage and template route and rewords AC-16 to "a return case never receives a complaint category and vice versa; case type is part of every analysis request" |
| C2 | PRD §8 Business ("replacing policies must not require changing product behavior") vs ADR-003 §3.5 | Template route copies policy facts into Polish code templates | Accepted trade-off already recorded in ADR-003; T02 adds it to PRD §12 as a known PoC limitation. No agent action beyond the guard test |
| C3 | ADR-003 TAC-003-07, ADR-000 TAC-09 | Model existence/capabilities (`gpt-6-luna-decisions`; image + `json_schema` + tools for `gpt-6-luna`) unverified; agent cannot test the key | T00 is a **human gate**; if it fails, fallback F1 (§8) and a proposed ADR amendment |
| C4 | ADR-003 §8, AGENTS.md mock-capture rule | Captures require the working key (C3) and the real request builders; services cannot be TDD'd against replays before builders exist | Plan orders each AI service as: request-builder unit tests → real capture → replay-based service tests (T32–T34) |
| C5 | ADR-002 §3 (`maxDuration` export) vs ADR-004 (Cache Components default on) | Unclear whether route segment `maxDuration` is allowed with Cache Components in Next.js 16.4 | **Resolved by R2 (2026-11-26):** `maxDuration` is allowed with Cache Components; `dynamic`, `dynamicParams`, `revalidate`, `fetchCache` are removed in that mode; POST route handler responses are never cached. ADR-002 already matches |
| C6 | ADR-001 §3 / ADR-004 step 8 | AI Elements is migrating to ui.shadcn.com; exact new pattern names/install commands not verified (only `Chat`, `Message`, `Prompt Input`, `Message Scroller` names seen) | **Resolved by R1 (2026-11-26):** new AI Elements are compositions of shadcn primitives, not a package: T10 runs `npx shadcn@latest add message-scroller message bubble input-group` (no `attachment` — AC-36), adds `streamdown` for assistant Markdown with raw HTML disabled (omit `defaultRehypePlugins.raw`, keep `sanitize` + `harden`), picks the Radix variant (matches the rest of shadcn/ui in ADR-001), and replaces English defaults ("Scroll to end/start", `aria-label="Messages"`, Spinner `"Loading"`) with Polish. Prompt Input is our own composition on `input-group`, submit disabled when `status` is `submitted`/`streaming`. Legacy registry not needed |
| C7 | PRD §9 ("company logo"), design-guidelines §1/§7 license notice | Logo is a trademarked third-party asset "for reference only" | **Decision needed:** use `assets/logo.svg` in the local PoC (recommended: yes, local demo only, not published) or a neutral text wordmark |
| C8 | AGENTS.md Manual QA ("Playwright CLI") vs ADR test strategy (Playwright test runner) | Two tools with the same name | Both are used: `@playwright/test` for automated E2E, `playwright-cli` for Manual QA screenshots (T63). No conflict once stated |
| C9 | Prompt "`docs/plans/-implementation-plan.md`" | File name placeholder was empty | This plan uses `hsdc-poc`; briefs use `docs/.agent-briefs/hsdc-poc-<task>.md` |
| C10 | ADR-000 §7 vs root `.env.example` | Root file lacks `DECISIONS_MODEL` and optional vars | T10 updates root `.env.example` and creates `app/.env.example` |
| C11 | ADR-003 §3.7 / ADR-000 §3 | `app/eval-reports/` and `.agent-logs/` must be gitignored; root `.gitignore` is a shared file | T10 (orchestrator-owned edit) |
| C12 | PRD §12 open questions (case number, chat message limit) | Not resolved | Out of scope; ADR-002 technical cap (100 messages) applies |
| C14 | Planning prompt ("commit the plan and briefs") vs root `.gitignore` (`.agent-briefs/` = "Private agent briefs") | Briefs cannot be committed without force-adding an ignored path | Repository rule wins: briefs stay local and untracked; traceability via issue links and this plan. Reviewer may change `.gitignore` if briefs should be shared |
| C15 | ADR-000/002/003 (`openrouter.decisionModel(id)`) vs published `@openrouter/ai-sdk-provider@3.1.0` | Method does not exist in 3.1.0; would break T30/T32 | **Resolved 2026-11-26:** ADRs corrected to `openrouter.evaluationModel(id)` used with `experimental_decide` (ai adapts the legacy model); routing options at `providerOptions.openrouter.provider.{data_collection, require_parameters}`. Optional extra test double: `Experimental_DecisionMockModelV4` from `ai/test` (HTTP replay stays the primary mock per ADR-003 §8) |
| C13 | ADR-003 §3.3 R10 vs reviewer's choice of screening areas | In `hybrid` mode every complaint escalates to the LLM | Accepted (recorded in ADR-003); eval report (T62) informs a later decision |

---

## 4. Phases, critical path and hotspots

The whole PoC is delivered in one implementation run with one final PR. Phases are internal checkpoints: each ends with its checkpoint row (CP-n), where the orchestrator re-runs the full suite and reviews the accumulated diff before the next phase starts.

| Phase | Goal | Tasks | Checkpoint / PR |
|---|---|---|---|
| P0 | Gates and governance | T00–T03, R1–R3 | Docs PR (T01): PRD + ADRs + plan |
| P1 | Verified scaffold | T10–T12 | CP-1 |
| P2 | Pure domain (contracts, dates, rules, routing, templates) | T20–T24 | CP-2 |
| P3 | Server foundation + AI services with real captures | T30–T34 | CP-3 |
| P4 | API route handlers | T40–T42 | I4 (real endpoints) |
| P5 | Frontend screens | T50–T53 | I5 (real browser flow) |
| P6 | E2E, evaluation, Manual QA, review | T60–T65 | **Single implementation PR (T65)** |

**Critical path:** T00 → T01 → T10 → T20 → T21 → T22 → T30 → T33 → T41 → T52 → T61 → T63 → T64 → T65.

**Shared-file hotspots (serialized, orchestrator-owned or single-task):** `app/package.json` + `package-lock.json` (T10 only; later dependency changes go through the orchestrator), `app/src/domain/contracts.ts` (T20 only; later changes need orchestrator approval), root `.gitignore` and `.env.example` (T10), `app/src/app/globals.css` (T11), `app/src/app/page.tsx` (T50), `app/src/server/ai/prompts/*` (one file per owning task), `tests/fixtures/llm-captures/` (subfolder per service).

---

## 5. Dependency matrix (authoritative)

Status values: `Not started`, `Blocked (<reason>)`, `In progress`, `In review`, `Done (<commit>)`. Issue numbers (fork issues, label `hsdc-poc`) follow each task ID, e.g. `T10 (#10)`.

Paths below are relative to `app/` unless they start with `docs/`, `assets/` or `/`.

| Task | Observable outcome | PRD/ADR links | Prerequisites | Owner/model | Editable files | Verification and handoff | Status |
|---|---|---|---|---|---|---|---|
| **T00** (#3) Model & key gate | Human confirms: key returns HTTP 200 on `GET /api/v1/key`; `openai/gpt-6-luna-decisions` listed with image input; `openai/gpt-6-luna` supports image input, `structured_outputs`, `tools` | ADR-003 TAC-003-07; ADR-000 TAC-09 | — | **Human** (agent is not permitted to read the key); orchestrator interprets output | none (results recorded later in T32 README) | Output pasted into the session; orchestrator records verdict in this table. Fail → F1 | Not started |
| **T01** (#4) Docs branch + PR, implementation branch | `docs/hsdc-prd-adr-plan` from `999885f` with cherry-picked `579ac60`, `1adc014`, `ab6852f` + plan commit (`Docs: add implementation plan`); pushed; PR against `origin/design-system` containing only PRD (+policies), ADRs, plan (+ `999885f` if it is not yet on `origin/design-system`, see §10.4); `feature/hsdc-poc` created from `docs/hsdc-prd-adr-plan` | AGENTS.md Commit Rules | Plan approval | Orchestrator (Opus 5.5) | `docs/plans/hsdc-poc-implementation-plan.md` (commit only) | `git diff --stat origin/design-system...docs/hsdc-prd-adr-plan` lists only `docs/PRD.md`, `docs/policies/**`, `docs/README.md`, `docs/ADR/**`, `docs/plans/**` (+ `999885f` files if applicable); cherry-picks apply without conflicts; `docs/design-system-header-shots` unchanged. Push/PR only with explicit approval | Done (`3c656dc`, `d6c17b1`, `f495e93`; PR #2) |
| **T02** (#5) PRD amendment (proposed) | PRD updated per C1/C2: screening stage, template route, AC-16 wording, policy-template limitation — committed on `docs/hsdc-prd-adr-plan` so it ships in the docs PR | PRD §4, §11, AC-16; ADR-003 §3 | T01 branch created; reviewer decision on C1 | Orchestrator drafts, human approves | `docs/PRD.md` | Diff review by human; doc consistency check (links, AC IDs unchanged except AC-16). Commit `Docs: align PRD with screening stage` | Blocked (C1 decision) |
| **T03** (#6) Enable Issues + create issues | Issues enabled; one issue per task T00–T65, R1–R3 with link to this plan; IDs written into §5 | Reviewer decision | Plan approval | Orchestrator | this plan (§5 issue IDs) | `gh issue list` count = task count. Commit `Docs: link plan tasks to issues` | Done (issues #3–#40, label `hsdc-poc`) |
| **R1** (#7) Research: AI Elements current patterns | Brief report: exact pattern names, install/copy method, dependencies (Markdown renderer, Tailwind 4, React 19), how `data-*` parts are rendered, Polish string locations | ADR-001 §3, §6; ADR-004 step 8 | Plan approval | OpenCode headless, `openrouter/openai/gpt-6-luna`, agent `plan` (read-only). Why: cheap, fast, reads many web pages | none (report in `.agent-logs/`) | Orchestrator spot-checks 2 claims against the source pages; summary pasted into T10 brief | Done (accepted 2026-11-26; install command and Streamdown HTML handling verified via Context7 `/shadcn-ui/ui`, `/vercel/streamdown`; report in `.agent-logs/hsdc-poc-R1.report.md`) |
| **R2** (#8) Research: Next.js 16.4 + AI SDK 7 specifics | Report: `maxDuration` with Cache Components (C5); `experimental_decide` + `openrouter.decisionModel` current signatures; `convertToModelMessages` async; `toUIMessageStream` usage; provider `fetch` injection | ADR-002 §3; ADR-003 §2 | Plan approval | OpenCode headless, `openrouter/openai/gpt-6-luna`, `plan` agent, parallel with R1 and R3. Orchestrator cross-checks with Context7 `/vercel/ai`, `/openrouterteam/ai-sdk-provider`, `/vercel/next.js/v16.4.5` | none | Orchestrator verifies every API name via Context7 before it enters a brief | Done (accepted 2026-11-26; `evaluationModel` correction and mocks verified in npm tarballs; ADR-000/002/003 corrected, see C15; report in `.agent-logs/hsdc-poc-R2.report.md`) |
| **R3** (#9) Research: test tooling | Report: Vitest 5 config for mixed jsdom/node projects; Playwright 1.65 `webServer` + tag filtering; `@axe-core/playwright` usage | ADR-004 step 10 | Plan approval | OpenCode headless, `opencode/deepseek-v4.1-flash-free` (free; low-risk lookup), `plan` agent | none | Orchestrator verifies via Context7 `/vitest-dev/vitest`, `/microsoft/playwright` | Done (accepted 2026-11-26; key claims verified via Context7; report in `.agent-logs/hsdc-poc-R3.report.md`) |
| **T10** (#10) Scaffold | Next.js 16.4 app per ADR-004 steps 0–8, 11, 12 (create-next-app with exact flags, README restore, strict tsconfig, exact-pinned deps, shadcn init + components, AI Elements patterns, scripts, env examples, gitignore entries) | ADR-004 §3 steps 0–8, 11, 12; ADR-000 §3, §7 | T00 pass (or F1 decision), T01, R1 | Sonnet 5.5 subagent (multi-step CLI work with judgment). Orchestrator owns root `.gitignore` / `.env.example` edits | `app/**` (new), `/.gitignore`, `/.env.example` | `npm run lint`, `npm run typecheck`, `npm run build` green; `npm run start` serves `/` (HTTP 200 via curl) — recorded separately. Exact versions in `package.json`; no nested `.git`. Commit `App: scaffold Next.js app with AI SDK and shadcn` | Not started |
| **T11** (#11) Brand layout | `@theme` tokens from `assets/design-tokens.json`, DM Sans via `next/font/local`, logo/favicon, shared header "Hardware Service Decision Copilot", single-column shell | ADR-001 §3 "Layout, brand and accessibility"; design-guidelines §1–§8; PRD §9; AC-40, AC-41 | T10; C7 decision | Sonnet 5.5 (visual judgment). Concurrent with T12 | `src/app/globals.css`, `src/app/layout.tsx`, `src/fonts/**`, `public/**`, `src/components/site-header.tsx` | Failing component test first (header renders product name and logo alt text); Playwright CLI screenshots at 360/1440 px compared with `assets/homepage.png`; no horizontal scroll. Commit `Frontend: brand tokens, fonts and header` | Not started |
| **T12** (#12) Test infrastructure | Vitest (node + jsdom projects), Testing Library setup, Playwright config (`webServer` build+start, 3 browsers, `@live` excluded), axe helper, extended `app/AGENTS.md` | ADR-004 steps 10, 13; ADR-000 §10 | T10, R3 | Sonnet 5.5. Concurrent with T11 | `vitest.config.ts`, `src/test/setup.ts`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `AGENTS.md` (app/) | One smoke unit test and one smoke E2E (page loads, no console errors) pass; `npx playwright test --list` shows projects. Commit `Test: configure Vitest and Playwright` | Not started |
| **CP-1** (#13) | Scaffold checkpoint: full suite green on `feature/hsdc-poc`, accumulated diff reviewed | AGENTS.md Verification, Code Review Rules | T10–T12 Done | Orchestrator (Opus 5.5) + independent reviewer subagent (Opus 5.5, code-only brief) | — | Orchestrator re-runs lint/typecheck/test/build/start; review findings fixed before P2. No push | Not started |
| **T20** (#14) Shared contracts | zod schemas + inferred types: `CaseInput`, `CaseImage`, `ScreeningResult`, `DeterministicFacts`, `Route`, `DecisionResult`, `FirstMessage`, `DecisionOutput`, `ChangeDecisionInput/Result`, `ErrorResponse`, `CaseUIMessage` data part | ADR-000 §5; ADR-002 §4; ADR-003 §4 | CP-1 | **Orchestrator (Opus 5.5)** — shared contract, serialized | `src/domain/contracts.ts`, `src/domain/contracts.test.ts` | Failing schema tests first (valid/invalid fixtures per schema, incl. AC-04..AC-08 limits); then green. Commit `Domain: shared contracts` | Not started |
| **T21** (#15) Dates, labels, rules | `domain/dates` (Europe/Warsaw clock, day/month math), `domain/decision-labels` (AC-18/19 verbatim), `domain/decision-rules` (`resolveOutcome`, rule-ID validation) | ADR-003 §3.1; AC-18..AC-22, AC-24 | T20 | Sonnet 5.5. Concurrent with T23, T24 | `src/domain/dates.ts`, `decision-labels.ts`, `decision-rules.ts` + `*.test.ts` | Tests first: day 14/15, 30/31, 24 months ± 1 day, 2024-02-29, DST weeks, cross-type rejection; 100 % branch coverage. Commit `Domain: dates, labels and decision rules` | Not started |
| **T22** (#16) Routing | `domain/routing`: certainty computation and R1–R10 × 3 modes | ADR-003 §3.2 "Certainty", §3.3 | T21 | Sonnet 5.5 | `src/domain/routing.ts`, `routing.test.ts` | Table-driven tests covering every cell of ADR-003 §3.3, threshold 0.79/0.80, refusal, first-match order; 100 % branches. Commit `Domain: screening router` | Not started |
| **T23** (#17) Case schema & file signature | Form schema with exact Polish messages (AC-04..AC-08), conditional description rules, magic-byte detection | ADR-001 §3 Form/Photo; AC-01..AC-08, AC-13 | T20 | Sonnet 5.5. Concurrent with T21, T24 | `src/domain/case-schema.ts`, `file-signature.ts` + tests | Tests first incl. `assets/example-images/laptop-1.png` (JPEG bytes) accepted, GIF/txt rejected, 10 MB boundary. Commit `Domain: case form schema and file signatures` | Not started |
| **T24** (#18) First message & templates | `domain/first-message` (structure + canonical text), `domain/templates` (Polish templates per route), template↔policy guard test | ADR-003 §3.5; ADR-001 §3 first message; AC-23, AC-25..AC-28 | T21 (labels) | Sonnet 5.5 (Polish copy quality). Concurrent with T22 after T21 | `src/domain/first-message.ts`, `templates.ts` + tests | Tests first: AC-25 order, AC-26 verbatim, ≥ 2 photo tips, day count + plural forms, guard test fails when a policy address/day count is altered (mutation demo, then revert). Commit `Domain: first message and decision templates` | Not started |
| **CP-2** (#19) | Domain checkpoint | ADR-000 TAC-03 | T20–T24 Done | Orchestrator (Opus 5.5) + independent reviewer subagent (Opus 5.5, code-only brief) | — | Coverage report (100 % branches for routing/rules/dates) recorded in this row; review fixes before P3 | Not started |
| **T30** (#20) Server foundation | `server/env`, `server/llm` (provider with injectable `fetch`, `getChatModel`, `getDecisionModel`, `data_collection: deny`), `server/policies`, `server/http` (envelope, size guard, metadata logger) | ADR-002 §3; ADR-003 §6 privacy | CP-2, R2 | Sonnet 5.5 | `src/server/env.ts`, `llm.ts`, `policies.ts`, `http/**` + tests | Tests first: missing/invalid env → config error; policy parser returns RET-1..7, CMP-1..8; logger never prints content fields. Commit `Backend: server foundation` | Not started |
| **T31** (#21) Capture harness | `npm run capture:llm` saves verbatim HTTP status/headers/body + metadata (date, endpoint, model, prompt version, request summary, no secrets); replay `fetch` helper for tests; `tests/fixtures/llm-captures/README.md` with T00 verification results | ADR-003 §8; AGENTS.md mock rule | T30, T00 | Sonnet 5.5 | `scripts/capture-llm.ts`, `src/test/replay-fetch.ts`, `tests/fixtures/llm-captures/README.md` + tests | Unit test: replay helper fails on unmatched requests; headers with auth are redacted. Commit `Test: OpenRouter capture and replay harness` | Not started |
| **T32** (#22) Screening service | Question file, state builder (no description), `screenCase` with refusal folding, certainty via T22 | ADR-003 §3.2; ADR-002 screening contract | T31, T22 | Sonnet 5.5 | `src/server/ai/screening.ts`, `src/server/ai/prompts/screening.questions.md`, `tests/fixtures/llm-captures/screening/**` + tests | (1) builder tests first (top-level image part, JSON form, no `user`/`session_id`); (2) orchestrator runs real capture for 5 photos × 2 case types; (3) replay tests for success, refusal, 5xx, timeout. Commit `Backend: Luna Decisions screening service` | Not started |
| **T33** (#23) Escalated decision service | Decision prompts, message builder (facts, form, signals, image), `decideWithLlm` with corrective retry and `require_parameters` | ADR-003 §3.4; AC-16, AC-24, AC-27 | T31, T21, T24 | Sonnet 5.5 (escalate to Opus 5.5 if two review rounds fail on prompt quality) | `src/server/ai/decision.ts`, `prompts/decision.*.md`, `prompts/_guardrails.md`, `tests/fixtures/llm-captures/decision/**` + tests | Builder tests → real captures (escalated return with description, complaint) → replay tests incl. invalid rule ID retry. Commit `Backend: escalated multimodal decision service` | Not started |
| **T34** (#24) Chat service | Chat prompts, `streamChat` with `changeDecision` tool validated by `resolveOutcome` | ADR-003 §3.6; AC-32..AC-36 | T31, T21, T24 | Sonnet 5.5. Concurrent with T33 (disjoint files; `_guardrails.md` owned by T33, read-only here) | `src/server/ai/chat.ts`, `prompts/chat.*.md`, `tests/fixtures/llm-captures/chat/**` + tests | Builder tests → captures (question, new fact, pressure, off-topic) → replay tests: `data-decision` only on accepted tool call. Commit `Backend: chat service with decision tool` | Not started |
| **CP-3** (#25) | AI services checkpoint | AGENTS.md Code Review Rules | T30–T34 Done | Orchestrator (Opus 5.5) + independent reviewer subagent (Opus 5.5, code-only brief) | — | Review with prompt-injection and secret-handling focus; captures' metadata match prompt versions | Not started |
| **T40** (#26) Screening route | `POST /api/cases/screening` per contract | ADR-002 §5 screening | CP-3 | Haiku 5.5 (thin adapter, clear contract). Concurrent with T41, T42 | `src/app/api/cases/screening/route.ts` + `route.test.ts` | Integration tests (replay): 200, 400, 413, 415, 502, 504; zero real network. Commit `Backend: screening endpoint` | Not started |
| **T41** (#27) Decision route | `POST /api/cases/decision`: facts → route → template or LLM; mode/threshold from env | ADR-002 §5 decision; ADR-003 §3.3 | CP-3 | Sonnet 5.5 (routing integration) | `src/app/api/cases/decision/route.ts` + test | Template route makes zero outbound requests; llm route exactly one; mode matrix; corrective retry. Commit `Backend: decision endpoint` | Not started |
| **T42** (#28) Chat route | `POST /api/chat` streaming per contract, limits, disconnect abort | ADR-002 §5 chat | CP-3 | Sonnet 5.5 | `src/app/api/chat/route.ts` + test | Stream contains text parts; `data-decision` before text on accepted change; 400 on limits; abort within 1 s. Commit `Backend: chat endpoint` | Not started |
| **I4** (#29) Backend integration check | Running app answers all three endpoints with real OpenRouter calls | ADR-002 §5 | T40–T42 | Orchestrator | none | `npm run build && npm run start`; curl each endpoint with a synthetic form and `assets/example-images/phone-1.jpg`; record status, timings, decision path. Startup recorded separately from tests | Not started |
| **T50** (#30) Session shell | Reducer state machine, page wiring, leave-page guard | ADR-001 §3 "Page and state machine"; AC-39 | I4 | Sonnet 5.5 | `src/features/case-session/**`, `src/app/page.tsx` | Reducer tests first (all transitions, reset, object URL revocation); guard registered only when needed. Commit `Frontend: case session state machine` | Not started |
| **T51** (#31) Form & photo | Form screen with all fields, validation UX, photo field, hints, AI notice, texts | ADR-001 §3 Form/Photo; AC-01..AC-13, AC-40, AC-42 | T50, T23, T11 | Sonnet 5.5. Concurrent with T53 | `src/features/case-form/**`, `src/lib/compress-image.ts` + tests | Component tests first per ADR-001 §8 rows 1–9; compression unit test with mocked canvas. Commit `Frontend: case form and photo field` | Not started |
| **T52** (#32) Processing orchestration | Submit flow: compress → screening → decision, stage texts, 90 s abort, error banner + retry | ADR-001 §3 Processing; AC-14, AC-15, AC-17 | T51, T40, T41 | Sonnet 5.5 | `src/features/processing/**` + tests | Component tests with stubbed `fetch` (stages, failures in each stage, fake-timer 90 s). Commit `Frontend: processing flow` | Not started |
| **T53** (#33) Chat screen | Summary card, AI Elements chat, structured first message, decision header, input limits, typing, retry, new-case dialog | ADR-001 §3 Chat; AC-25..AC-38 | T50, T42, T24 | Sonnet 5.5. Concurrent with T51 | `src/features/chat/**`, `src/components/ai-elements/**` (Polish strings only) + tests | Component tests per ADR-001 §8 rows 12–20 with a streaming transport stub. Commit `Frontend: chat screen` | Not started |
| **I5** (#34) Frontend integration | Full flow works in a real browser against real endpoints | PRD §4.1–4.7 | T52, T53 | Orchestrator | none | Start app; Playwright CLI run of return + complaint flows; screenshots of form, processing, chat; console clean | Not started |
| **T60** (#35) E2E without LLM | Validation, layout 360–1920 px, keyboard, axe, leave-page guard | AC-01..AC-13, AC-39, AC-41, AC-42; ADR-001 TAC-001-04/05 | I5 | Sonnet 5.5 | `tests/e2e/form.spec.ts`, `layout.spec.ts`, `a11y.spec.ts` | `npm run test:e2e` green in chromium, firefox, webkit. Commit `Test: E2E form, layout and accessibility` | Not started |
| **T61** (#36) Live E2E | L1–L6 on real models | ADR-003 §8 live table; AC-20..AC-23, AC-25, AC-26, AC-32..AC-35 | I5, T00 | Sonnet 5.5 writes; **orchestrator runs** (costs money) | `tests/e2e/live.spec.ts` | `npm run test:e2e:live` green; costs and decision paths recorded for the implementation PR body. Commit `Test: live E2E scenarios` | Not started |
| **T62** (#37) Evaluation script + first report | `npm run eval:decisions` report over photos × forms × 3 modes | ADR-003 §3.7, TAC-003-06 | I5 | Sonnet 5.5 builds; orchestrator runs; **GPT-6 Luna via OpenCode (read-only)** summarizes the JSON report into findings | `scripts/eval-decisions.ts` + report-builder test | Report generated (gitignored); summary with escalation rate, disagreements, cost added to the implementation PR body; threshold change only by human decision. Commit `Test: decision mode evaluation script` | Not started |
| **T63** (#38) Manual QA | Human-like run of all PRD flows 4.1–4.7 on the real app, screenshots, brand comparison | AGENTS.md Manual QA; design-guidelines; PRD §4 | T60–T62 | Orchestrator (Opus 5.5) with `playwright-cli` | `docs/qa/` screenshots only if the reviewer wants them committed (default: attach to PR) | Checklist per flow with screenshot paths; every defect fixed via a new task row before T64 | Not started |
| **T64** (#39) Independent review | Review of the full diff vs PRD/ADRs: correctness, security (secrets, prompt injection, error masking), tests not weakened | AGENTS.md Code Review Rules | T63 | Independent Opus 5.5 subagent with a code-only brief (not the orchestrator's conclusions) + `/code-review` | none | Findings list; each fixed or explicitly accepted by the human | Not started |
| **T65** (#40) Single implementation PR + cleanup | One PR `feature/hsdc-poc` → base agreed in §10.5 (default: `docs/hsdc-prd-adr-plan` until the docs PR merges, then retargeted) with AC traceability table, test/startup evidence, live-run costs, eval summary; after merge, plan and briefs deleted in a final commit | §9 DoD | T64 | Orchestrator + human | `docs/plans/hsdc-poc-implementation-plan.md`, `docs/.agent-briefs/**` (delete) | DoD checklist complete; human approves push/PR and merges | Not started |

---

## 6. Workers, models and how to run them

| Worker | Model | Used for | Why |
|---|---|---|---|
| Orchestrator | Claude Opus 5.5 | T01–T03, T20, integration checks I4/I5, captures, live runs, T63, commits, PRs | Owns contracts, decisions, acceptance |
| Claude Code ad hoc subagent | Sonnet 5.5 (`model: sonnet`) | Most TDD implementation tasks | Strong at multi-file TypeScript with tests |
| Claude Code ad hoc subagent | Haiku 5.5 (`model: haiku`) | T40 (thin adapter with complete contract) | Cheap and adequate for bounded, fully specified work |
| Independent reviewer | Opus 5.5 subagent + `/code-review` | PR gates, T64 | Review stays with a capable model and the human |
| OpenCode headless | `openrouter/openai/gpt-6-luna` | R1, R2, T62 summary | Cheap, fast, good for reading many sources in parallel |
| OpenCode headless | `opencode/deepseek-v4.1-flash-free` | R3 | Free; low-risk lookups (free list changes — re-check with `opencode models` before dispatch) |

**Escalation rule:** a worker is escalated (Haiku → Sonnet → Opus) when its result fails the orchestrator's re-run of the verification twice, or when it reports contradictions it cannot resolve within the brief.

**No custom roles.** All workers are ad hoc with an exact brief; no `.claude/agents/` files are created (no recurring role justifies one).

### OpenCode headless — how to run (research rows only)

- **Binary:** `~/.opencode/bin/opencode` (not on `PATH`; use the full path).
- **Command:** `~/.opencode/bin/opencode run "Execute the attached brief hsdc-poc-R1. Read-only: do not edit files. Report findings with source URLs." --agent plan -m openrouter/openai/gpt-6-luna --dir /home/labuser/jsystems-ai-programming-2026-11 --format json --title hsdc-poc-R1 -f docs/.agent-briefs/hsdc-poc-R1.md`
- **Pitfall (observed 2026-11-26):** `-f` is an array option — the message must come **before** `-f`, otherwise it is parsed as a second file name. OpenCode then prints `Error: File not found` but still **exits 0**, so success is judged from the log content (assistant text events present, no `Error:` line), never from the exit code.
- **Brief:** passed as an attached file with `-f`; the message only points to it.
- **Permissions:** built-in `plan` agent (no file edits); **no `--auto`**. Observed in R2: the `plan` agent can still run `bash` (it used `npx ctx7` lookups) — after each run the orchestrator lists the bash commands from the JSON log and checks `git status` before accepting. If web fetch is blocked by a permission prompt in headless mode, the run stops and the orchestrator falls back to the `web-fetch` subagent — permissions are not widened without the human.
- **Output:** redirect stdout/stderr to `.agent-logs/hsdc-poc-R1.jsonl` (gitignored); the orchestrator extracts the final answer and pastes the verified summary into the consuming task's brief.
- **Parallelism:** R1, R2, R3 run concurrently (read-only, no shared files); each brief lists the other two as concurrent work.

---

## 7. Per-task protocol

1. **Brief** compiled just before dispatch at `docs/.agent-briefs/hsdc-poc-<task>.md`: goal, linked PRD ACs/ADR sections, relevant source excerpts and current contracts (from T20), predecessor outputs, exact editable files, concurrent tasks, ordered steps, test inputs and expected results, commands to run, report format.
2. **Red:** worker writes failing behavioral tests first and reports the failure reason.
3. **Green:** minimal implementation; worker runs the task's checks and returns diff + command output.
4. **Accept:** orchestrator reads the diff, re-runs checks (`npm run lint`, `typecheck`, `test`, task-specific), confirms scope, commits with named paths.
5. **Integrate:** after dependent tasks, the phase integration check (I4, I5) runs on the real started app; build, tests and startup are reported as separate results with counts and skips.
6. **Checkpoint (CP-n / I4 / I5):** orchestrator re-runs the full suite and the integration check, an independent reviewer subagent reviews the phase diff, findings are fixed; work continues on the same `feature/hsdc-poc` branch. Nothing is pushed until T65.
7. **Final PR (T65):** one PR for the whole PoC after T64; the human approves push and PR creation and performs the merge.

---

## 8. Failure handling, rollback and fallback

| Situation | Handling |
|---|---|
| Task fails verification | Orchestrator does not commit; sends findings back once; second failure → escalate model or split the task |
| Bad commit discovered later | Before T65 (unpushed): `git revert <commit>` on `feature/hsdc-poc` (no history rewrite, keeps the audit trail); after push: revert only |
| Whole run must be abandoned | `feature/hsdc-poc` stays unmerged; docs PR is unaffected; fallback F3 restarts from the last green checkpoint commit |
| Contract change needed mid-phase | Stop dependent tasks; orchestrator updates T20 contract in its own commit; re-brief affected tasks |
| OpenRouter outage / rate limit | Unit/integration continue on replays; live tasks (captures, I4, T61, T62) wait |
| Cost concern | Live calls only by the orchestrator: captures (T32–T34), I4, I5, T61, T62, T63 |

**F1 — Decisions model unavailable (T00 fails for `gpt-6-luna-decisions`):** propose an ADR-003 amendment (status Proposed) for `DECISION_MODE=llm-always` only, with stage 1 replaced by an LLM image-analysis call; T32 and T62 are dropped; no code is written for F1 before the amendment is approved.
**F2 — Chat LLM lacks image or structured-output support:** reviewer picks another `LLM_MODEL` (config change only); captures are re-recorded.
**F3 — Time or tool shortage (smaller deliverable):** keep P1–P5 and T60/T63/T64 with `hybrid` mode only; drop T62, `decisions-only`/`llm-always` modes (env defaults to `hybrid`), reduce T61 to L1, L3, L5; AI Elements may be replaced by plain shadcn components on `useChat` if R1/T10 show the patterns unavailable.
**F4 — OpenCode unusable headless:** run R1–R3 with the `web-fetch` subagent / Context7 in the orchestrator session.

---

## 9. Definition of Done (whole plan)

- [ ] Every PRD AC-01..AC-42 is covered by at least one passing automated test or a recorded Manual QA step (traceability table in the final PR body).
- [ ] ADR TACs pass: ADR-000 TAC-01..09, ADR-001 TAC-001-01..05, ADR-002 TAC-002-01..05, ADR-003 TAC-003-01..07, ADR-004 TAC-004-01..05.
- [ ] `npm run lint`, `typecheck`, `test`, `build` green with zero warnings; `npm run start` serves the app (recorded separately); `test:e2e` green in 3 browsers; `test:e2e:live` green.
- [ ] All OpenRouter mocks are replays of captures with metadata matching current prompt versions.
- [ ] Manual QA of flows 4.1–4.7 done on the real app with screenshots compared to the brand reference; no console errors; Polish UI.
- [ ] First evaluation report reviewed by the human; threshold decision recorded (kept or changed).
- [ ] Independent review findings resolved or accepted by the human.
- [ ] Docs PR (PRD + ADRs + plan) and the single implementation PR merged by the human; issues closed.
- [ ] This plan and `docs/.agent-briefs/` deleted in a final commit.

---

## 10. Unresolved decisions (reviewer)

1. **C1** — approve the PRD amendment for the screening stage and template route (T02)?
2. **C7** — use `assets/logo.svg` in the local PoC, or a neutral text wordmark?
3. **T00** — run the key and model checks (commands in the session) and paste the results.
4. **Docs PR base** — commit `999885f` (header screenshots) is not on `origin/design-system` (`db4b03b`). Either (a, recommended) accept that the docs PR also shows that one design-system commit, or (b) push `docs/design-system-header-shots` up to `999885f` first and target the docs PR at it so the diff shows only PRD + ADRs + plan. The other local commits (`c7b09f4`, `7f0f73c`, `af6468d`) stay on `docs/design-system-header-shots` and are out of scope.
5. **Implementation PR base** — default: `feature/hsdc-poc` → `docs/hsdc-prd-adr-plan` while the docs PR is open (stacked), retargeted to the docs PR's base after it merges. Confirm or name another base.

**First bounded task after approval:** T00 (human key/model gate), in parallel with R1–R3 (read-only research). T01 (docs branch and PR) can run at the same time. T10 starts only after T00 passes, `feature/hsdc-poc` exists and R1 is accepted; the implementation does not wait for the docs PR to merge (stacked branch).

**Review gate:** the reviewer approves this plan (or requests changes); then the orchestrator performs T01 (push/PR only with approval) and T03 (enable Issues, create issues), compiles the first briefs and dispatches. The PoC is then implemented as a whole, ending in one PR (T65).
