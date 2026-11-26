<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Stack rules (hsdc-poc)

Next.js + AI SDK + shadcn/ui, TypeScript strict. UI text is Polish, code, comments and docs are English. Architecture: `docs/ADR/000-main-architecture.md`; scaffold: `docs/ADR/004-project-initialization.md`.

## Commands (run from `app/`)

| Command | What it does / needs |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev, production build, production server on port 3000 |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier write (components in `src/components/ui` are ignored) |
| `npm run test` | Vitest `unit` (node) and `components` (jsdom) projects; no network |
| `npm run test:watch` | Vitest watch |
| `npm run test:coverage` | Vitest + v8 coverage with the ADR-000 TAC-03 thresholds on `src/domain` |
| `npm run test:e2e` | Playwright chromium, firefox, webkit without `@live` tests; builds and starts the app itself (reuses a server on :3000 outside CI) |
| `npm run test:e2e:live` | Playwright `live` project: real app, real OpenRouter, costs money; needs `.env.local` |

## Folder boundaries and import direction

- `src/domain`: zod schemas and pure logic. Imports no `next`, `ai`, `server/*` or `features/*`.
- `src/server/*`: every entry imports `server-only`. Never import it from client code.
- `src/app/api/*`: thin HTTP adapters over `server` and `domain`.
- `src/features/*`: screens and client orchestration. `src/components/ui`: shadcn primitives (generated, not linted by Prettier).
- Direction: `features -> components`, `features -> domain`, `app/api -> server -> domain`, `scripts -> server -> domain`. No cycles.
- No `NEXT_PUBLIC_` variables; secrets stay server-side.

## Test layers (ADR-000 section 10)

- Unit (node): `src/domain`, `src/server`, `src/app/api`, `scripts`, `src/test` (`*.test.ts`).
- Component (jsdom + Testing Library): `src/**/*.test.tsx`. Import `describe/it/expect` from `vitest` (no globals).
- E2E (Playwright, `tests/e2e`): real stack. Tag tests that call OpenRouter with `@live`; they run only in the `live` project. Use `expectNoSeriousA11yViolations(page)` from `tests/e2e/helpers/axe.ts`.
- In Vitest `server-only` is aliased to an empty module in the `unit` project only (`src/test/server-only-empty.ts`).

## Realism rules

- No `page.route`, `route.fulfill` or MSW in E2E.
- Unit/integration doubles are verbatim replays of real captures in `tests/fixtures/llm-captures/` and `tests/fixtures/api-captures/`; never write a double from documentation.
- No `ai/test` mock models. No test-only flags or branches in `src/`.
- Do not weaken or delete a test to hide a defect.

## Libraries

- Query Context7 `/vercel/ai` and `/openrouterteam/ai-sdk-provider` before using AI SDK APIs. AI packages are exact-pinned; upgrade deliberately, then re-capture and run the full suite.
- Check Context7 for Vitest, Playwright and Next.js APIs too; majors differ from training data.
