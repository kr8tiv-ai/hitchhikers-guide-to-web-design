---
id: 245j
title: Skill router - each site prompt gets only the knowledge-pack rules, motion recipes and anti-patterns for its own sections
kind: build
effort: xhigh
model: grok-4.7-build-fast
depends_on: 245h
---

# 245j - Skill router: inject only the relevant rules per section (BUG-146)

## Context

Run 11 prompts were about 32 KB each, mostly shared context and every rule. The engine already has skill packs: `loadSkillPacks`, `parseSkillPack`, `selectSkillPacks(query, packs)`, `planSkillLines`, `expandSkillIncludes` in `packages/engine/src/spec/skills.ts`; site rules in `site-rules.ts` (`SITE_RULES`); goldens in `packages/knowledge/golden/`; anti-patterns in `packages/qa/src/antislop.ts` and `prompt-bans.ts`; recipes in `@hitchhiker/design-system` (245d).

Confirm by reading the code; if the real code differs from this description, adapt and say so in the commit body. Prefer wiring existing code over new code.

## Deliverables

1. `routeSkills({ sectionKinds, variants, features, motionRecipes, world })` built on `selectSkillPacks`: returns the rule lines, recipe names and anti-patterns that apply to those sections only, each tagged with its source. Every site rule in `SITE_RULES` gets tags (for example `LISTING_PHOTO_RULE` only for listing sections, `SECOND_LANGUAGE_RULE` only when the site is bilingual).
2. Budget: at most about 800 bytes of routed rules per prompt (constant); over budget drops lowest-priority lines and records what was dropped in the prompt's front matter (`routed_out:`).
3. Expose it for 245k (prompt generator) and for fix prompts. Do not delete `SITE_RULES`; other callers keep working.

## Tests

Add `packages/engine/test/desk-run11-245j.test.ts` (and package-local tests where the code lives), failing first, then green, with short timeouts and no network, browser downloads or real grok calls (use fakes or cassettes):
- a hero section with the `statement` variant and split-line recipe gets the hero, type and split-line rules and no listing, forms or bilingual rules;
- a listing section gets `LISTING_PHOTO_RULE`;
- the routed block stays under the budget and records dropped lines;
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
feat(engine): route only the relevant rules, recipes and anti-patterns into each site prompt (245j)
```
