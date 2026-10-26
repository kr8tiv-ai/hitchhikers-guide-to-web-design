---
id: "243g"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243f"]
title: "Desk Run 11 design-stage fixes: serif display face against the owner's sans wish, fluid type clamps that never scale, accent button text below AA, one-section sitemap and wireframe, direction reference label, duplicated DESIGN sections"
---

# 243g. Desk Run 11 design stages follow the brief and pass their own rules

## Why
Desk Tester Run 11 (branch desk-run11-fixes at 1bd1a4df, project "Paradise Found Run Eleven C" in C:\Users\lucid\Desktop\desk-e2e-run11\site-c) re-drafted the plan on 243f and picked "Big quiet photography" (Boska and General Sans). 243f's BUG-079 to BUG-082 pass. Approve plan, Approve sitemap and Approve wireframe were pressed in the desk; the style guide (site-c\DESIGN.md) is waiting for a yes and has the bugs below. Evidence: site-c\.hitchhiker\SITE-BRIEF.md, interview.json (DP-1.5 type answer, DP-2.8 pages), directions.json, brand\BRAND.md, site-c\DESIGN.md, the sitemap and wireframe files the desk shows on /approve. Write the failing test first for each bug, then fix. All tests use a stubbed model: no Grok spawn, no billed call.

## BUG-084 (S2) The style guide sets a serif display face against the owner's stated sans wish
DESIGN.md front matter says typography.display.fontFamily "Boska" (a serif) while the owner answered "Light, wide, airy sans for headings like the logo" and BRAND.md itself says "The owner's words win over Boska ... the direction supplies General Sans." Do: when the owner's type wish names a classification (sans, serif, mono, script) and the picked or dealt display family does not match it, the display role uses a family that matches the owner's wish (the picked direction's sans, or a licensed sans from the same bundle that fits the adjectives), and DESIGN.md, BRAND.md, src/data/brand.ts and the prompts all name the same final display and body families. Test with the Run 11 answers: no output names Boska as the display face.

## BUG-085 (S3) Fluid type clamps never scale
DESIGN.md display: clamp(3.2rem, 2.6596rem + 0.1441vw, 4.7348rem). At 1440px the middle term is about 2.79rem, so the size is stuck at the 3.2rem minimum and the maximum is unreachable; every role has the same fault (the vw coefficient looks divided by 16). Do: compute the slope from the min and max sizes across the 360 to 1440 viewport range so the middle term equals the min at 360px and the max at 1440px. Test each role: the computed value at 360px and 1440px matches min and max within 0.01rem.

## BUG-086 (S3) The accent button fails AA contrast
DESIGN.md button uses textColor paper #f3e6d0 on backgroundColor accent #8a6a12 (4.11 to 1), and the kit says the accent is for large text only. Button labels are body size. Do: pick button colours from the kit that clear 4.5 to 1 for body-size text (for example ink on accent, paper on ink, or a darkened accent that keeps the hue), and say the ratio in DESIGN.md. Test: every text/background pair the style guide emits for normal-size text clears 4.5 to 1.

## BUG-083 (S3) Sitemap and wireframe give every page one placeholder section
The sitemap and wireframe list one section per page (Home: only "hero"; Farms: only "farms-main"; Farm detail: only "farm-detail-main"), ignoring the picked direction's sections (hero, gallery, story, visit) and the page contents in the approved brief (DP-2.8: Farms grid plus map and filters; detail page with gallery, specs, map and prefilled inquiry; How Buying Works steps and glossary). Do: build each page's sections from the brief's page description and the features mapped to it, with the picked direction's sections shaping Home, and draw the wireframe from those sections. Keep the coverage table consistent. Test with the Run 11 brief: Home has more than one section including the direction's, and Farms and Farm detail list the sections named in DP-2.8.

## BUG-087 (S4) A direction's Reference line repeats its title instead of naming the site
directions.json / BRAND.md: "Depth instead of a second pitch ... Reference: Depth instead of a second pitch. https://landonorris.com/". Do: the Reference line names the referenced site (for example "Lando Norris") from library metadata, falling back to the URL host. Test.

## BUG-088 (S4) DESIGN.md repeats sections
DESIGN.md has both "## Colors" and "## Color", both "## Typography" and "## Type scale" with the same lines, and "## Overview" repeats the intro sentence. Do: emit each section once (keep any heading names a validator or test requires, with the content written once and the other heading removed or pointing to it). Test that no two DESIGN.md sections have identical bodies.

## Done when
pnpm typecheck, lint, the touched packages' tests and the new or updated e2e pass. Do not touch other bugs. Never loosen or delete an existing assertion to make it pass.

## Commit
```
fix(app,engine): Desk Run 11 design stages follow the owner's type wish, fluid clamps scale, AA buttons, real sitemap sections, clean references and DESIGN sections (243g)
```