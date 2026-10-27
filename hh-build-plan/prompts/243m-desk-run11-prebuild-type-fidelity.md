---
id: "243m"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243l"]
title: "Desk Run 11 re-test of 243l: pre-build checks still use the replaced display face, style guide provenance contradictions"
---

# 243m. Make the pre-build checks and style guide agree with the resolved type and colours

## Why
Desk Run 11 re-test on main 4b777bab (project "Paradise Found Run Eleven C", folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c, files under site-c\.hitchhiker and site-c\DESIGN.md). 243l passed BUG-088 to BUG-092: DESIGN.md is named Paradise Found, keeps all five owner colours, uses General Sans for display and body at weight 300 with 0.06em tracking and 1.15 line height. What is still wrong:

1. BUG-095 (S3) The pre-build checks panel (packages/engine/src/spec/prebuild-checks.ts) still reports the direction's original pair, not the type DESIGN.md resolved after the owner's words replaced the display face:
   - "Mobile performance budget: Boska and General Sans estimate 28000 and 22000 bytes." Boska is not used anywhere in DESIGN.md, so the budget counts a font that will not ship and misses the real display weight.
   - "AI-look and typography: Boska x-height 0.678, General Sans x-height 0.734."
   - "Picked type pair: Boska and General Sans. Weights: Boska wght, General Sans one weight." DESIGN.md says display is General Sans weight 300 "because the family has a weight axis", so "General Sans one weight" contradicts it.
   Root cause to find: the checks read the picked direction's pair instead of the families and weights the style guide actually resolved (type-conflict.ts produces the override). Every check must read the same resolved type as DESIGN.md: families, weights (axis or static), x-heights and byte estimates. When display and body are the same family, say so once and budget it once (with the weights actually used). The "library pair" validation must accept an owner override that the style guide recorded, without dropping the check.
2. BUG-093 (S4) DESIGN.md Colors says "Muted #5c6570 is for secondary text. Source: brand kit." and the Tokens line tags every colour "Source: brand kit", while the same section says "Muted #5c6570 is not a colour the owner named. It is darkened until secondary text on the page clears 4.5 to 1." Each colour must carry its true source: the owner's named colours "Source: owner (DP-1.2)" or brand kit when they really came from an uploaded kit, a derived colour such as muted "Source: derived for contrast". No line may claim a source the colour does not have.
3. BUG-094 (S4) The Typography section of DESIGN.md says "The owner's words win over Boska: light, wide, airy sans for headings like the logo, and the direction supplies General Sans." The owner never saw or chose Boska; naming a rejected internal pick is reasoning leaking into the owner's document. Say plainly what was chosen and why from the owner's words (for example "Headings use General Sans at a light weight with wide tracking, from the owner's wish for a light, wide, airy sans like the logo."). The override may stay in the decision log.
4. OBS (S4) The Farms wireframe orders grid, map, filters, so the filters sit after the results. When a page has filters together with a grid or map of results, put the filters before the results in the sitemap and wireframe order.

## Do
1. Fix 1-4 at the root in packages/engine (start from src/spec/prebuild-checks.ts, src/brand/type-conflict.ts, src/brand/directions.ts, src/spec/design-outputs.ts and src/spec/design-stages.ts; follow the values to where they really come from). Do not special-case this project.
2. Add unit tests with the Run 11 values (direction pair Boska plus General Sans, owner type wish "light, wide, airy sans for headings like the logo", the five owner colours, Farms "grid plus map, filters"): the pre-build checks name only the resolved families and weights and never Boska, weights match DESIGN.md, the same family is budgeted once; each colour's source is true and muted is marked derived; the Typography text does not name the replaced face; filters come before grid and map.
3. Update existing tests only where they asserted the old wrong text, and say which in the report. Do not loosen, skip, `todo` or delete any other assertion or test. No retries or raised timeouts as fixes. Await every web-first assertion if you touch e2e specs.
4. Run `pnpm -r typecheck`, `pnpm lint` and the full `pnpm test` from the repo root and make them green (a wall-clock timeout of the known flaky kind on this PC may be reported rather than chased, but no wrong-value failure).

## Done when
- For the Run 11 brief the pre-build checks, DESIGN.md and the decision log agree on type: General Sans only, weight 300 for display, one budget line.
- Every colour in DESIGN.md states its real source.
- DESIGN.md does not mention a face the owner never chose.
- Filters come before results on the Farms page plan.
- Typecheck, lint and full tests are green on this PC.

## Commit
```
fix(engine): Desk Run 11 pre-build checks use the resolved type, style guide states true colour sources, filters before results (243m)
```