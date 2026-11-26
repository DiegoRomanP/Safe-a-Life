# Architecture — Save a Life (run-1, quick profile)

## 1. Product, principals, protected resources
Academic prototype connecting authorized Lima hospitals with volunteer blood donors (README.md:10-18). Synthetic data only. Principals:
- **anonymous**: login, donor registration, password recovery/reset, and token-bearer actions (admin-invitation preview/claim, donor email verification, assisted activation claim, email-change confirmation, invitation preview/response). The action token is the authorization; it is HMAC-hashed and consumed by RPCs via the `api_technical` identity.
- **donante**: `/api/v1/donors/me/*` (profile with approximate location, invitations, responses, correction/deletion requests).
- **admin_hospitalario**: `/api/v1/hospitals/me/*` (needs, invitation batches, aggregate coverage k=5, responses with names of confirmed donors only, assisted signups, sites). Needs role + AAL2 + active membership + authorized hospital.
- **superadmin**: `/api/v1/superadmin/*` (hospitals, sites, memberships, config, audit, task queue, PII access grants, privacy-request execution incl. account deletion). AAL2 always; TOTP step-up (300 s) on sensitive writes. Site PATCH and correction decide are AAL2 without step-up; `GET correction-requests/:id/donor-data` is superadminRead (needs grant in SQL).
- **worker** / **api_technical**: internal Supabase users signing in with env passwords; role from `user_accounts.role` (`is_worker`, `is_api_technical`).
- **Resend/Svix webhook sender**.
Protected: donor PII and location, donor↔need linkage, hospital tenant data, admin/superadmin accounts, action tokens, outbox payloads, secrets.

## 2. Comparable baseline
No comparable product is source-grounded. Protocol baselines: Supabase Auth JWT/JWKS, TOTP MFA, Svix webhook signatures, `__Host-` cookies + Origin + HMAC CSRF.

## 3. Stack, deployment, offline limits
TypeScript, Node 24.19.0, npm workspaces (apps/web, apps/mock-api demo; backend; frontend). Backend Express 5 + supabase-js + ajv; Postgres via RPC (`api` schema exposed only, config.toml:13) with user JWT + RLS; DEFINER functions owned by `app_privileged` (nobypassrls). `service_role` only in `identity-institutions/infrastructure/supabase-auth-admin.ts` (allowlist test). Deployment defined not deployed: Render Docker web + worker (render.yaml), Vercel frontend rewriting `/api` and injecting `x-edge-secret` (frontend/vercel.json). Production detected by `NODE_ENV=production` or `RENDER` (config/env.ts:81-84) and then rejects fake/dev-mailbox providers, missing edge secret, non-https URLs. Offline: backend vitest unit tests (no DB) run in the bwrap sandbox; DB/RLS tests need local Supabase (Docker) and are NOT run in this audit (shared local state). Remote Supabase/Resend/Vercel/Render are prohibited.

## 4. Entry surfaces and key paths
- Global pipeline `backend/src/app.ts:66-81`: securityHeaders → correlationId → requestLogger → edgeGuard (empty secret disables, prod rejects) → httpsOnly → originGuard (absent Origin passes) → webhook raw routes (64kb, inflate default) → `express.json` 16kb inflate:false → `authenticate` on `/api` (composition.ts:162-174) → module routers.
- Guards `backend/src/shared/http/route-helpers.ts:20-70`, `shared/auth/guards.ts`, `shared/http/csrf-guard.ts`, step-up.
- Routers: `modules/identity-institutions/http/{auth,action-tokens,institutions}.router.ts`, `modules/donor-records/http/donor-records.router.ts`, `modules/invitation-coordination/http/invitations.router.ts`, `modules/need-records/http/needs.router.ts`, `modules/privacy-requests/http/privacy-requests.router.ts`, `modules/email-delivery/http/resend-webhook.router.ts`, `modules/platform` health.
- Worker: `backend/src/worker.ts`, `composition-worker.ts`, `email-delivery/application/process-outbox.ts`, templates (`templates/common.ts` escaping, link = `APP_PUBLIC_URL/<route>#<token>`), senders (Resend, dev-mailbox file writer), purge job.
- SQL: `backend/supabase/migrations/*.sql` (app.require, d_require, admin_hospital_id, member_hospital_id, current_actor without session_admitted, session barrier, rate limiter technical-only, privacy execution, coverage).
- Frontend `frontend/src` (fragment tokens, in-memory session, `credentials:'same-origin'`, Leaflet/Mapbox, no dangerouslySetInnerHTML), CSP in vercel.json.
- Dev: `scripts/dev-mailbox.mjs` (127.0.0.1:4025, Host allowlist), `apps/mock-api` `/__mock/reset`.
- CI: `.github/workflows/ci.yml` (SHA-pinned), `security.yml` (tag-pinned, GITHUB_TOKEN to gitleaks).

## 5. Trust boundaries and strongest control
- Anonymous → token actions: token entropy/HMAC + one-time consumption in RPC + per-IP limits.
- Anonymous → login: per-IP/email limits, admission barrier; direct Supabase Auth login with anon key bypasses backend limits (deployment fact).
- Browser → cookie mutations: SameSite=Lax + exact Origin + HMAC CSRF bound to session_id.
- Role/tenant: `api.current_actor` + RLS + `app.require`/`admin_hospital_id`.
- Superadmin PII: AAL2 + step-up + access grant.
- Webhook: Svix HMAC ±300 s + svix-id dedup.
- Edge: `x-edge-secret` constant-time; proxy hop count deferred (ADR-004:70-74).
- Outbox: AES-GCM sealed payloads with outbox-id AAD, HTML escaping, token regex.

## 6. Starting paths
backend/src/app.ts, backend/src/composition.ts, backend/src/shared/{auth,http,crypto,persistence}, backend/src/modules/*/{http,application,infrastructure}, backend/src/config/env.ts, backend/supabase/migrations, frontend/src, scripts/dev-mailbox.mjs, apps/mock-api/src/app.ts, .github/workflows.

## 7. Prior coverage
No prior ledger or findings exist for this repo (first run). No carried confirmations, no revalidation targets.

## 8. Companion selection
- WEB-PROTOCOL-AND-AUTH.md: cookie sessions, CSRF, JWT/JWKS, MFA/step-up, password reset, invitation claim.
- DATA-ISOLATION-AND-LIFECYCLE.md: multi-hospital tenancy via RLS, donor PII, deletion/purge, coverage aggregates.
- PROTOCOLS-RPC-AND-MESSAGING.md: Resend webhook and outbox queue.
- RESOURCE-EXHAUSTION-AND-AVAILABILITY.md: pre-auth endpoints, rate-limit/quota accounting, Auth quotas.
- CLIENT-SIDE.md: React SPA, fragment tokens, maps, CSP.
- SUPPLY-CHAIN-AND-RELEASE.md: GitHub Actions, npm allowScripts, contract codegen.
Excluded: MEMORY-SAFETY (no native code), AI-AND-LLM (no model features), DESKTOP-MOBILE (no native/IPC), CLOUD-AND-DEPLOYMENT (no IaC beyond render.yaml/vercel.json; deployment facts become needs_validation inside web units).
