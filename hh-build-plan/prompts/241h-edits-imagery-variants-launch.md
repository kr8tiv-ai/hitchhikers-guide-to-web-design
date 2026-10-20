---
id: "241h"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241g"]
title: "BUG-057 section-scoped edits, credited imagery and grade, redesign order, parallel variants, juror floor, phase-gated references, launch checklist, defect log"
---

# 241h. BUG-057 section-scoped edits, credited imagery and grade, redesign order, parallel variants, juror floor, phase-gated references, launch checklist, defect log

## WHY (read this first)

The desk exists to make Grok's sites orders of magnitude more beautiful than plain Grok makes from the same brief, at least level with aura.build, and stunning on every device a visitor uses. The quality-gap audit and the harness study found real gaps: no font taste in code, gates that exist but are not called, visual bans that are only model opinion, Chromium-only checks at bare widths, and harness ideas proven elsewhere that the desk lacks. 240r researched the best way to close each gap. This spec builds part of that. Hard rule: the phone keeps the picture. Use adaptive techniques (DPR-aware rendering, tiered post chains, compressed textures and meshes, LOD, poster as the LCP image), never strip effects by width. Every check MEASURES OUTCOMES and never bans a library or technique. A font or choice the user named always wins. Keep the 239a no-AI-slop rule and the library-freedom rule.

Inputs (read the parts for your items in full before coding): `hh-build-plan/research/240r-summary.md` (the rows for your items are the spec detail: approach, how to measure, sources), `240r-fonts.md`, `240r-devices-and-polish.md`, `240r-harness-ideas.md`, `hh-quality-gap-audit-2026-10-19.md`, `hh-harness-research-2026-10-19.md`. Where 240a-240c or an earlier 241 spec already landed part of an item, extend it, do not duplicate it (check `git log` and the code first).

Font licenses are NOT verified (Matt's decision; 241z removes that gate). Ignore any license-verification parts of the research notes; library license fields are information only.

## RULES

Same RULES block as 220-240c (TypeScript strict, tests ship with the behavior, spec first: failing regression test, then root-cause fix, then green; at most two real attempts per item, then revert that item's partial product change and mark it BLOCKED with the reason; never weaken, skip, quarantine, delete, gate or loosen a test; never lower any Grok call's model or effort from `grok-4.7-build-fast` at `xhigh`; never skip the pushback judge; commit as soon as each item is green, never hold more than one item uncommitted; if a commit hook fails because Git Bash cannot fork (`0xC0000142`) do not bypass hooks, leave the work staged, record it, stop; no new dependencies in the desk repo itself; no secrets; cross-platform: Windows, macOS and Linux). Tests never spawn a real Grok session, never make a live model or Imagine call, never run the library ingest and never run `bench --run`; device, Lighthouse and vision checks in tests use local fixture pages and stubs. No test writes or runs a compiled `.exe`. Do not touch any Paradise Found project or a desk on port 4175. Do not deploy or publish.
## Items

Build audit 13 (imagery-grade half, summary row 13) and harness ideas 11, 12, 13, 19, 21, 22, 25 and 26 as described in `240r-harness-ideas.md` (one item, test and commit each):
- [ ] Audit 13 imagery: one consistent grade across the page; every image credited in `CREDITS.json`.
- [ ] Idea 11: section-scoped edits plus lock / target to stop regressions.
- [ ] Idea 12: real credited imagery and footage sourcing.
- [ ] Idea 13: redesign order type, color, frame, states, components, with before / after.
- [ ] Idea 19: parallel variants and combine.
- [ ] Idea 21: "give no juror a reason to mark you down" floor checklist.
- [ ] Idea 22: phase-gated reference loading (fits the 240a `@skill` mechanism).
- [ ] Idea 25: yes / no launch checklist run twice, staging then the live domain within an hour. The desk only prepares and runs the checklist when the user deploys; it never deploys.
- [ ] Idea 26: severity-graded defect log with regression retest after each Elevate pass.
## Verification
`pnpm -r test`, lint, typecheck and e2e green on Windows.

## Report back
Per item: commit SHA, pass or BLOCKED with the reason.

## Commit
```nfeat(engine): BUG-057 scoped edits, credited imagery, redesign order, variants, juror floor, phase-gated refs, launch checklist, defect log (241h)
```n