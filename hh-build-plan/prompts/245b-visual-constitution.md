---
id: 245b
title: VISUAL-CONSTITUTION.md - a short constitution generated from the locked DESIGN.md and injected at the top of every build prompt
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245a
---

# 245b - VISUAL-CONSTITUTION.md: tokens, signature moments and a do-not-do list, at the top of every build prompt (BUG-138)

## Context

Run 11's prompts never restated the design in one place; each carried 30 KB of mixed context. 245a makes DESIGN.md the locked source of truth (`writeDesignMd` in `packages/engine/src/spec/design-outputs.ts`, `lintDesignMd` in `design-md-lint.ts`, lock in `.hitchhiker/design-lock.json`). The anti-slop linter (`lintSlop`, `packages/qa/src/antislop.ts`) and the prompt bans (`packages/engine/src/spec/prompt-bans.ts`) already hold the generic "do not" patterns.

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. Generate `VISUAL-CONSTITUTION.md` at the project root from the locked DESIGN.md whenever the lock is written (and only then): Brand idea (1-2 lines), the font pair, colour roles with hex, the spacing and type scale in one line each, the motion profile, the 1-3 signature moments (from Signature techniques), and a do-not-do list (at most 10 lines: the brand's own don'ts from DESIGN.md "Do's and Don'ts" plus the matching `lintSlop` / prompt-bans patterns). Hard cap 1,200 bytes; trim the do-not list first.
2. The engine never lets a session edit it: it is regenerated from DESIGN.md, and the 245a drift check fails if it differs from a fresh render.
3. Add `constitutionBlock(projectDir)` that returns the file text for prompt builders. 245k injects it; this prompt also injects it at the top of the per-prompt recovery and fix prompts built by the 244k mechanism.

## Tests

Add `packages/engine/test/desk-run11-245b.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- locking DESIGN.md writes the constitution with every listed part, under 1,200 bytes; a long don't list is trimmed;
- an edited constitution makes the drift check fail;
- a 244k recovery prompt starts with the constitution text;
- all earlier 244 and 245 tests pass unchanged.

## Verification Gates

Run from the repository root (the driver's gate script runs these as TC / LINT / TEST1 / CLI / ORCH / ENGINE):
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter @hitchhiker/engine test`
If a fixture trips a check, fix the fixture, never weaken the check. Never use `--no-verify`, never run `hh brief --approve`, never push, and do not delete code that other prompts or tests use (replace and migrate callers instead).

## Commit

```
feat(engine): generate VISUAL-CONSTITUTION.md from the locked DESIGN.md and put it at the top of build prompts (245b)
```
