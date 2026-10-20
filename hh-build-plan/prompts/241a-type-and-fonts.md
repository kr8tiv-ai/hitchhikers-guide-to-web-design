---
id: "241a"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["240r"]
title: "BUG-050 type and fonts: curated pairing library from artistic foundries, overused defaults, built-site type gate, font licenses, brief-derived type scale, mood words to type"
---

# 241a. BUG-050 type and fonts: curated pairing library from artistic foundries, overused defaults, built-site type gate, font licenses, brief-derived type scale, mood words to type

## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than plain Grok makes from the same brief, at least level with aura.build, and stunning on every device a visitor uses. The quality-gap audit and the harness study found real gaps: no font taste in code, gates that exist but are not called, visual bans that are only model opinion, Chromium-only checks at bare widths, and harness ideas proven elsewhere that the desk lacks. 240r researched the best way to close each gap. This spec builds part of that. Hard rule: the phone keeps the picture. Use adaptive techniques (DPR-aware rendering, tiered post chains, compressed textures and meshes, LOD, poster as the LCP image), never strip effects by width. Every check MEASURES OUTCOMES and never bans a library or technique. A font or choice the user named always wins. Keep the 239a no-AI-slop rule and the library-freedom rule.

Inputs (read the parts for your items in full before coding): `hh-build-plan/research/240r-summary.md` (the rows for your items are the spec detail: approach, how to measure, sources), `240r-fonts.md`, `240r-devices-and-polish.md`, `240r-harness-ideas.md`, `hh-quality-gap-audit-2026-10-19.md`, `hh-harness-research-2026-10-19.md`. Where 240a-240c or an earlier 241 spec already landed part of an item, extend it, do not duplicate it (check `git log` and the code first).

## RULES

Same RULES block as 220-240c (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself; no secrets; cross-platform: Windows, macOS and Linux). Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest and never run `bench --run`; device, Lighthouse and vision checks in tests use local fixture pages and stubs. No test writes or runs a compiled `.exe`. Do not touch any Paradise Found project or a desk on port 4175. Do not deploy or publish.
## Items

- [ ] **Audit 1, font policy.** Replace the six `TYPE_PAIRINGS` in `packages/engine/src/brand/tokens.ts` with the pairing library from the JSON appendix in `240r-fonts.md`, organised by mood, era, tone and industry, with license, source, woff2 and rationale per pair. `OVERUSED_DEFAULTS` exactly as in the summary row; refused unless the user named the family. Inter leaves the defaults. A mood with no match never falls to index 0.
- [ ] **Reconcile the pair count first.** The summary says 48 pairs; the prose numbers entries up to 52 (some are notes such as "52. Outfit is not given a pair" and the Pangram reference pairs that must not ship). The JSON appendix is the source of truth. Count it, check every numbered prose pair is in the appendix or listed as excluded with its reason, fix the research note's count line if it is wrong, and add a test that the shipped library count equals the appendix count and no Pangram trial face or unverified-license face ships as a default (Climate Crisis stays out of defaults until its `OFL.txt` and axes are confirmed).
- [ ] **Audit 2, built-site type gate** (summary row 2, all thresholds and the byte budget). Playwright at 375 and 1440.
- [ ] **Audit 3, font license check** (row 3) in `packages/qa/src/licenses.ts`, with the failing fixtures named there.
- [ ] **Audit 4, type scale from the brief** (row 4 ratios and minimums), families and ratio written into DESIGN.md.
- [ ] **Harness idea 27, mood adjectives to palette and type** in the interview for non-programmers, feeding the pairing pick.
## Verification
`pnpm -r test`, lint, typecheck and e2e green on Windows.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason.

## Commit
```nfeat(engine): BUG-050 curated font pairing library, overused defaults, type gate, font licenses, brief-derived type scale (241a)
```n