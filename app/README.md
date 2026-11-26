# App

This folder will contain the application built during the course.

## How to start

The app is scaffolded live during the course through a structured process:

1. **Research** — use agents to research and validate the project idea
2. **PRD** — generate a Product Requirements Document (`../docs/PRD.md`)
3. **ADR** — generate Architecture Decision Records (`../docs/ADR/`) to choose the tech stack
4. **Scaffold** — use the chosen boilerplate (`create-next-app`, AI SDK starter, Mastra, etc.)
5. **Implement** — build features with agents using TDD

## Checklist

Use this checklist during scaffolding. Some items are provided by the boilerplate (e.g. `create-next-app` ships `tsconfig.json`, ESLint config). Others you add explicitly.

### Project setup
- [x] Choose framework (Next.js, Express+Vite, Mastra, other) — record in ADR
- [x] Initialize project (e.g. `npx create-next-app@latest` or equivalent)
- [x] TypeScript config (`tsconfig.json`)
- [x] Package manager chosen (npm / pnpm / bun)

### Code quality
- [x] ESLint config (`eslint.config.js`)
- [ ] Prettier config (`.prettierrc`, `.prettierignore`)
- [ ] `.editorconfig` (optional but recommended)

### Testing
- [x] Unit/integration test runner (Vitest / Jest)
- [x] E2E test runner (Playwright)
- [ ] Test setup file (e.g. `test-setup.ts` with Testing Library matchers)

### Environment
- [x] `.env.example` with required env vars (API keys, ports)
- [ ] `.env` created locally (gitignored)
- [x] `.gitignore` (node_modules, .env, build output, etc.)

### AI integration
- [x] Vercel AI SDK (`ai` package) or equivalent
- [ ] API route / endpoint for chat
- [ ] Model configuration (provider, model name, API key from env)

### Design
- [ ] Design tokens (`../assets/design-tokens.json`)
- [x] Tailwind CSS or equivalent
- [ ] Logo and favicon (`../assets/`)
- [ ] Design system doc (`../docs/design-guidelines.md`)

### Documentation
- [ ] PRD (`../docs/PRD.md`)
- [ ] ADRs (`../docs/ADR/`)
- [ ] AGENTS.md in `app/` with stack-specific rules

## Notes

- Don't create config files manually if the boilerplate provides them — it leads to conflicts.
- Let the agent research and recommend the right boilerplate based on the ADR decisions.
- Keep this folder organized: separate routes, components, domain logic, and tests.

## Commands

Run from `app/`:

- `npm run dev` - Next.js dev server
- `npm run build` - production build
- `npm run start` - production server on port 3000
- `npm run lint` - ESLint, zero warnings allowed
- `npm run typecheck` - `tsc --noEmit`
- `npm run format` - Prettier write
- `npm run test` - Vitest (unit + components), no network
- `npm run test:watch` - Vitest watch
- `npm run test:coverage` - Vitest with v8 coverage and domain thresholds
- `npm run test:e2e` - Playwright (chromium, firefox, webkit), starts the app itself, no `@live` tests
- `npm run test:e2e:live` - Playwright `live` project, real OpenRouter (costs money, needs `.env.local`)

AI Elements source: shadcn/ui (ui.shadcn.com/docs/ai-elements), Radix variant, installed via npx shadcn@latest add message-scroller message bubble input-group
