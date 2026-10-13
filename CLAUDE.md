# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`AGENTS.md` holds the binding rules (privacy/PII, clinical limits, approved stack,
architecture, Definition of Done, review gates). They apply to Claude Code too.
Before touching domain, data, authorization, matching or notifications, read
`.opencode/references/project-requirements.md` and the matching skill under
`.opencode/skills/<name>/SKILL.md`. These are not Claude Code skills; open them
with Read. Repo docs, plans and UI copy are in Spanish, so write in Spanish there.

Claude Code is now a documented harness in `docs/Agent-Workflow.md` ("Claude
Code"). The roles in `.opencode/agent/*.md` (reviewer-back,
security-privacy-auditor, clinical-safety-reviewer, etc.) are not registered as
subagents: for a review gate, launch a `general-purpose` subagent through the
`Agent` tool with the role file's content plus scope and paths, read-only. A
PASS counts as a gate only if that subagent did not write the artifact. The
user approves the close of each module. Log the work in a per-task plan at
`docs/plans/YYYY-MM-DD-<slug>.md`, never claim a PASS that did not happen, and
do not overwrite other tasks' plans.

## Commands

Run everything from the repo root. Required versions: Node 24.19.0 (`.nvmrc`),
npm 12.0.2, Bruno CLI 4.2.0 on `PATH`. The root `package-lock.json` is the only
lockfile, so never run `npm install` inside `backend/` or other workspaces.

```bash
SCARF_ANALYTICS=false npm ci       # respects allowScripts policy (ADR-002)
npm run dev                        # Vite web :5173 + Express mock :4011 (not the backend)
npm run mock:prism                 # static contract mock on :4010, separate

npm test                           # vitest in all workspaces (mock-api, web, backend)
npm run test:backend:dto           # backend DTO validators only
npm run test:api                   # mock-api Supertest integration
npm run test:contract              # Prism + Ajv2020 contract runner
npm run test:bruno                 # starts/resets mock on ephemeral port, runs bruno/scenarios
npm run test:backend:db            # pgTAP (needs `supabase start --workdir backend`)
npm run test:backend:integration   # vitest against local Supabase (resets + seeds the DB)
npm run test:bruno:backend         # Bruno CLI against the REAL backend (bruno/backend/**)
npm run test:e2e -- --trace=off    # Playwright; stop `npm run dev` first
npm run typecheck                  # also `npm run lint` (= tsc --noEmit)
npm run build
npm run openapi:lint
npm run openapi:types              # regenerate types/snapshot from docs/openapi.json
npm run openapi:api:check          # fail if generated artifacts drifted
```

Single test:

```bash
npm run test --workspace backend -- src/modules/need-records/dto/validators.test.ts -t "<name>"
npm run test --workspace @save-a-life/web -- src/api/client.test.ts
npm run test:e2e -- --trace=off -g "<title>"
```

Always run E2E through `npm run test:e2e`, not plain `playwright test`. The
wrapper generates the `MOCK_RESET_TOKEN` that `playwright.config.ts` requires.
If Chromium is missing, run `npx playwright install chromium`.

## Architecture

The npm workspace has three members: `apps/web`, `apps/mock-api` and `backend`.

- **Contract-first.** `docs/openapi.json` (OpenAPI 3.1) is the single canonical
  contract. `scripts/generate-api-contract.mjs` derives six generated files from
  it: `backend/src/contract/openapi.ts`,
  `backend/src/contract/ratified-schemas.generated.json` (per-operation schemas of
  every ratified operation, used by `compileOperation`),
  `backend/src/modules/need-records/dto/openapi.ts`,
  `backend/.../dto/contract.generated.json`, `apps/web/src/api/openapi.ts` and
  `apps/mock-api/src/api/openapi.ts`. Never hand-edit these. Edit the JSON, then
  lint, run `openapi:types`, and rerun the contract/Bruno tests.
- **Ratification status.** Ratified for implementation (`x-ratification` in
  `docs/openapi.json`): the four need operations of F3 (`createHospitalNeed`,
  list, get and transition of own needs), the health pair and the 21
  identity-institutions operations of F2a (session, MFA, step-up, hospitals,
  sites, memberships, configuration, audit, task queue). The rest are drafts.
  Implementing any of them, or changing behavior around open AP items, needs
  explicit user approval per module. `docs/Backend-Contracts.md` defines the
  ratified scope.
- **`apps/web`** is React 18 + Vite + Tailwind 4 + react-router. Vite proxies
  `/api` to the mock on port 4011 only, with no fallback to Prism or the backend.
- **`apps/mock-api`** is a stateful Express + zod demo with synthetic in-memory
  state. Its auth, CSRF, AAL2 and permissions are demos and prove nothing about
  real auth or RLS. `/__mock/reset` is a test-only endpoint and is not in OpenAPI.
- **`backend`** is the production modular monolith (Express, Supabase, Resend
  behind adapters). `src/server.ts` is the entrypoint (`npm run dev:backend`),
  `src/composition.ts` wires the adapters, `src/app.ts` exposes
  `createApp({config, logger, mount})`, `src/config/env.ts` validates the
  environment and `src/shared/*` holds HTTP, auth, persistence and crypto pieces.
  `src/modules/{platform,identity-institutions,need-records}` are implemented
  (F2a, F3); `need-records/dto/` has the AJV 2020 validators. `supabase/` holds
  the local project: migrations, `seed.sql` and pgTAP tests. Planned modules are
  listed in the capability map in
  `docs/plans/2026-10-12-api-backend-completo-incremental.md`; the execution
  spec is `docs/plans/2026-10-12-especificacion-faltante-backend.md`.
- **Monolito modular, two top-level folders.** The production frontend goes in
  `frontend/` (not built yet; today it holds only a Vite template that is not a
  workspace, so do not run it or build on that template's logic) and the
  production backend goes in `backend/`. Do not delete `frontend/`. `apps/web`
  is the demo web against the mock until the real frontend exists. The old
  `backend/index.js`, `backend/config/` and `database/esquema.sql` were already
  removed.
- **Persistence direction (ADR-003, accepted).** Use PostgreSQL functions called
  through Supabase RPC behind backend ports and adapters. Each atomic command is
  one RPC. A sequence of SDK calls is not a transaction. Use a request-scoped
  client with the user's JWT, plus RLS. Never use `service_role` for ordinary
  operations. Resolve role and hospital from protected data, never from client
  arguments or editable metadata.
- **`bruno/`** has the imported OpenAPI collection plus `scenarios/` per role.
  Reuse it and do not regenerate over existing scenarios or envs. Real backend
  endpoints must be verified with Bruno CLI; Prism or the mock do not count as
  backend evidence.
- **ADRs** live in `docs/decisions/`. ADR-001 sets the stack (Node/Express,
  Supabase, Resend). ADR-002 sets the dev tooling pins and install-script
  policy. Do not change an approved ADR without the user's decision.

## Repo conventions

- Use Conventional Commits, one atomic commit per verified unit. The working
  tree often contains unrelated uncommitted work (docs, plans, agent config), so
  stage only files from your own unit and never `git add -A`.
- Use only synthetic data, with `.example.test` emails. Do not share Playwright
  traces, HAR files, cookies or request bodies.
