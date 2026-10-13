# Pi project adaptation

Date: 2026-10-07
Status: Technical adaptation completed; native review deferred by explicit user decision
Coordinator: Senior / el Gentleman
Canonical recovery checklist: `odd/tasks/pi-project-adaptation.md`

> **Historical note (2026-10-11):** This records the earlier Gentle-based
> adaptation, not the current Pi runtime. The active setup now uses
> `pi-open-agents` and `pi-agent-modes`; follow `.pi/README.md` and
> `docs/plans/2026-10-11-reparacion-configuracion-pi.md` for current tool names,
> IDs and execution behavior. Do not reapply the Gentle discovery/tool mapping.

## Request and decisions
Prepare a minimal project-wide `.pi/` adaptation while keeping `.opencode/` intact. Preserve the twelve roles and conditional specialist routing. Reuse skills/references instead of copying them. Use the approved `openai-codex` provider with the original explicit model IDs and compatible effort levels. Keep Pi's default restrictions; do not add an OpenCode-permission emulator. Configure Context7, Firecrawl, GitHub and Git disabled until setup is checked. OpenAPI corrections are paused.

## Acceptance
1. Gentle discovers valid project agents; Senior remains the parent coordinator, not an independently invoked competing parent.
2. Source role/skill requirements and mandatory review gates remain available.
3. Skill locations and supporting references resolve without copying source trees or licenses.
4. Explicit model/effort assignments are preserved under the approved provider; source roles without explicit assignments remain inheritable unless explicitly documented otherwise.
5. Only the four approved MCPs are configured; all disabled, credentials represented by environment references.
6. No product/source/global configuration changes, installs, model calls, server connections, commits or publishing.
7. Independent structural verification and area/security review PASS; unavailable live checks remain explicitly pending.

## Assignments
| Task | Owner | Allowed surfaces | Status |
| --- | --- | --- | --- |
| T1 inventory/decisions | Parent + read-only investigator | Read-only source/docs/catalog | Completed |
| T2 agents, coordination, skills | Writer `muz0t3js-2-spde` | `.pi/APPEND_SYSTEM.md`, `.pi/agents/*.md`, `.pi/settings.json`, `.pi/subagents.json` | Complete; structural checks and area re-review PASS |
| T3 MCP and setup guide | Same writer, sequentially | `.pi/mcp.json`, `.pi/README.md` | Complete; four disabled servers, official Git launcher, review PASS |
| T4 verification/review | Verifier `muz225eh-6-jqco`, independent area/security reviewers | Read-only `.pi/` and selected dependencies | PASS; native review deferred by user |

## Checks and evidence
- Inventory: `del_muz03eb8_9gpx` completed read-only; 12 agents, 18 source skills, 3 source MCPs.
- Original native exploration/verification tasks failed with `assistant reported an error`; fallback was disclosed.
- Local Pi catalog lists `gpt-6-luna` and `gpt-6.1-sol` under `openai-codex`; this is catalog/authentication availability, not a successful inference call.
- Baseline: `.pi/` absent; unrelated existing working-tree changes recorded before adaptation.
- Structural checks/resource-loader checks will verify resulting configuration. No product tests/builds are required for unchanged product behavior.
- Engram mirror unavailable due to incompatible local binary (`instance-id` unsupported). Local recovery document retained.
- User explicitly declined creating a commit to isolate the candidate and chose to leave native review pending. No branch/stage/commit/publishing; no native START/receipt/approved closure; RDD unchanged. The adaptation's technical checks and independent reviews passed without sweeping in existing dirty changes.

## Log
- 2026-10-07: User decisions reconciled; tracking created before first implementation write.
- Native writer initially failed before tools: inherited Anthropic child routing returned `401 authentication_error: invalid x-api-key`. Parent bootstrapped only the understood approved local `.pi/subagents.json`; subsequent delegated worker and reviewer ran successfully on Codex. No global credentials/configuration changed.
- Writer completed Senior bridge, eleven child agents, seventeen source skill paths, four disabled MCPs and README. Independent reviewer-back initially BLOCKED missing documentation that project APPEND replaces the global APPEND file. Writer corrected it; reviewer `muz1b8rm-3-gled` returned PASS.
- Parent confirmed official Git MCP documentation; writer replaced the invalid npm launcher with `uvx mcp-server-git --repository .`, `cwd: .`, disabled. No install/server execution.
- Native ASSESS returned unassessable due undeclared untracked files; its required writer self-verification and independent verification path is honored. INSPECT confirmed eleven unrelated tracked dirty files and requested intended-untracked selection. No START or receipt: the current workspace candidate is not isolated.
- Area re-review PASS and static security/privacy gate `muz225gw-7-wt7k` PASS. LSP checked seven changed configuration/documentation paths, clean=7 and diagnostics=0.
- Independent verifier `muz225eh-6-jqco` final PASS: actual Gentle/Pi loaders and MCP parser; 11 children, 17 skills, 61 role dependencies, four disabled servers, exact catalog/effort helpers, negative-trust behavior, 16 `.pi/` files and 392 lines. `uvx` exists, never executed. Probe-local hashes/status stayed unchanged, not adaptation-start/RDD evidence. First verifier regex probe failed; corrected extraction passed, with no candidate defect.
- Preexisting source caveat: `.opencode/skills/spec-driven-development/SKILL.md:208` links to missing `skills/context-engineering/SKILL.md`; no source edit was made. Role-to-skill dependencies resolve, but not every internal source link can be certified.
- No meaningful behavior-level RED applies or was observed: this changes configuration/instructions only. Directory absence was a resource baseline probe, not TDD evidence. Product tests/builds, live authentication and MCP behavior checks are not run.
- Engram `mem_save` attempted and failed because local binary lacks `instance-id`; no global memory setup changed. Local recovery file retained.
