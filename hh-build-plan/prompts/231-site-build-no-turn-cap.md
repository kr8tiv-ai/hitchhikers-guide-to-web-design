---
id: "231"
kind: fix
phase: improbability-drive
slice: Forty-Two
title: "Site builds stop at max turns: lift the per-prompt turn cap"
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
depends_on: ["230"]
files: ["packages/engine/src/", "packages/engine/test/", "packages/app/src/", "packages/app/test/", "packages/orchestrator/src/"]
review_checkpoint_embedded: false
---

# 231. Site build runner stops on the max-turns cap

## RULES

Same RULES block as 220-230 (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts, then revert the partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies; no secrets; anti-slop plain copy; cross-platform: Windows, macOS and Linux).

- This session runs in the worktree `C:\Users\lucid\Desktop\hh-fix-wt` on branch `fix-231`. Work only there. Never touch `C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design`.
- Do not touch `C:\Users\lucid\Desktop\paradise-found\` (read-only evidence), the desk on 127.0.0.1:4175, ports 4173/4174. Use a temp project and another port; stop anything you start. Do not stop grok or node processes you did not start.
- Do not edit `.hh-driver/`, `hh-build-plan/` or CI workflows. Do not push, do not merge, do not stash, no deploy.
- Tests never spawn a real Grok session; use the injectable runner/stubs and cassettes.

## Bug

Paradise Found Run 3 stopped at site build prompt 012 (`project3/.hitchhiker/logs/build-012.log` ends with `{"type":"max_turns_reached"}`, `stopReason":"cancelled"`, `num_turns":80`, stderr `Error: max turns reached`). The desk's site-build runner passes `--max-turns 80` (`packages/engine/src/guide/site-build.ts` `buildSpawnArgs`), and site prompts carry `MAX_TURNS` 40/60/80 by effort (`packages/engine/src/spec/site-prompts.ts`) validated to 1..100 (`site-validate.ts`).

Owner rule: a site build must never stop on a time or turn limit, only on a real blocker.

## Items

### 1. No turn cap on site build prompts
- [ ] The site-build spawn (and anything else that runs a site build prompt for the desk) runs with no effective turn cap. Prefer omitting `--max-turns` entirely if the grok CLI treats absence as unlimited (check `grok --help` read-only); otherwise pass one named constant that is effectively unlimited (e.g. 100000). Make sure the per-prompt `max_turns` in generated site prompts / validation no longer imposes 40-80 or a 100 ceiling on site builds (keep or relax validation consistently; do not break existing prompt files). Also make sure no wall-clock timeout kills a running site build prompt; keep the existing stall/no-output handling only if it already exists and is about a hung process.
- [ ] Keep real failure handling intact: 402/billing pause and escalate (225), non-zero exit errors, the failure state and Retry in the UI.
- [ ] If a build does still end with `max_turns_reached`, it must be surfaced as a failure with Retry (never as success).
- Brief-draft and other short think calls keep their own small caps; this is about site build prompts only.
Tests: a test asserting `buildSpawnArgs` has no `--max-turns` (or the unlimited constant), a test that generated site prompts no longer cap at 40-80, and existing 402/failure/Retry tests still pass.

### 2. Verify
Run the full verification block. Fix any red at the root on every OS.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm -r test
pnpm exec tsc -b --pretty false
pnpm --filter @hitchhiker/app exec playwright test
```

If a spec fails, rerun it once to rule out a flake before treating it as real.

## Report back

At most 200 words in the commit body and `.hitchhiker-dev/summaries/231.md`.

## Commit

```
fix(engine): site builds run with no max-turns cap, stop only on real blockers (231)
```