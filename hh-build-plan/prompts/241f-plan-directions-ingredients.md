---
id: "241f"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241e"]
title: "BUG-055 plan then critique the plan, screenshot fix loop, AI-cluster blacklist gate, direction dealing, ingredients-first references"
---

# 241f. BUG-055 plan then critique the plan, screenshot fix loop, AI-cluster blacklist gate, direction dealing, ingredients-first references

## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than plain Grok makes from the same brief, at least level with aura.build, and stunning on every device a visitor uses. The quality-gap audit and the harness study found real gaps: no font taste in code, gates that exist but are not called, visual bans that are only model opinion, Chromium-only checks at bare widths, and harness ideas proven elsewhere that the desk lacks. 240r researched the best way to close each gap. This spec builds part of that. Hard rule: the phone keeps the picture. Use adaptive techniques (DPR-aware rendering, tiered post chains, compressed textures and meshes, LOD, poster as the LCP image), never strip effects by width. Every check MEASURES OUTCOMES and never bans a library or technique. A font or choice the user named always wins. Keep the 239a no-AI-slop rule and the library-freedom rule.

Inputs (read the parts for your items in full before coding): `hh-build-plan/research/240r-summary.md` (the rows for your items are the spec detail: approach, how to measure, sources), `240r-fonts.md`, `240r-devices-and-polish.md`, `240r-harness-ideas.md`, `hh-quality-gap-audit-2026-10-19.md`, `hh-harness-research-2026-10-19.md`. Where 240a-240c or an earlier 241 spec already landed part of an item, extend it, do not duplicate it (check `git log` and the code first).

Font licenses are NOT verified (Matt's decision; 241z removes that gate). Ignore any license-verification parts of the research notes; library license fields are information only.

## RULES

Same RULES block as 220-240c (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself; no secrets; cross-platform: Windows, macOS and Linux). Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest and never run `bench --run`; device, Lighthouse and vision checks in tests use local fixture pages and stubs. No test writes or runs a compiled `.exe`. Do not touch any Paradise Found project or a desk on port 4175. Do not deploy or publish.
## Items

Build harness ideas 1, 2, 3, 4 and 5 exactly as described in `240r-harness-ideas.md` and `hh-harness-research-2026-10-19.md` (each one its own item, its own test, its own commit):
- [ ] Idea 1: plan-then-critique-the-plan before code (tokens and ASCII wireframes, then a "would any similar brief produce this" critique).
- [ ] Idea 2: screenshot fix loop, top 3 issues x max 3 rounds at 3 widths.
- [ ] Idea 3: codified AI-cluster blacklist (palette and chrome tells, same names as the 241a overused list) as a gate.
- [ ] Idea 4: direction dealing, 3 of N researched directions from real SOTD study (work with the current library size; do not run ingest).
- [ ] Idea 5: ingredients-first `@` references to library sections and templates as code context.
## Verification
`pnpm -r test`, lint, typecheck and e2e green on Windows.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason.

## Commit
```nfeat(engine): BUG-055 plan critique, screenshot fix loop, AI-cluster blacklist gate, direction dealing, ingredients-first references (241f)
```n