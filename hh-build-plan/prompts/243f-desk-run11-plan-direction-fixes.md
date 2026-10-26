---
id: "243f"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243e"]
title: "Desk Run 11 plan fixes: the picked direction never reaches the kit or the prompts, style lines contradict the approved brief, mid-word truncation, budget text in the Imagine stem"
---

# 243f. Desk Run 11 plan follows the approved brief and the picked direction

## Why
Desk Tester Run 11 (branch desk-run11-fixes at cde124c6, project "Paradise Found Run Eleven C" in C:\Users\lucid\Desktop\desk-e2e-run11\site-c) re-drafted the plan on 243e (brief approved in the desk, plan 25 of 25 covered), then picked the direction "Big quiet photography" on /approve with the reason "The owner loves Patagonia's big quiet photography." 243e's BUG-075 to BUG-078 pass. Four new bugs would carry wrong facts into the build. Evidence: site-c\.hitchhiker\SITE-BRIEF.md (approved), interview.json, directions.json (pickedId dir-patagonia), decisions.jsonl, brand\BRAND.md, prompts\002.md, src\data\brand.ts. Write the failing test first for each bug, then fix. All tests use a stubbed model: no Grok spawn, no billed call.

## BUG-079 (S2) The picked direction never reaches the brand kit, DESIGN inputs or the drafted prompts
The plan drafts when the brief is approved, before a direction is picked (draftBriefPlan in packages/engine/src/guide/site-build.ts writes the prompts and BRAND.md once and returns early when prompts exist). After the pick, BRAND.md still says "Dealt families: Syne and Spline Sans." and prompts\002.md says "Families: Syne and Spline Sans.", while the picked direction is Boska and General Sans with hue #1f6b4a and sections hero, gallery, story, visit. Do: when a direction is picked or changed, rewrite the brand kit Type line (and src/data/brand.ts if it carries type), and the style lines of every not-yet-built prompt, from the picked direction, and keep Approve plan / Start build reading the same files. Prompts that have already run are not rewritten. Tests: pick a direction on a drafted Run 11 style project and assert BRAND.md and the queued prompts name the picked families and none name the old dealt pair; changing direction rewrites them again; with no pick the current behaviour holds.

## BUG-080 (S2) Prompt style lines contradict the approved brief
prompts\002.md Acceptance says "Type voice: A large serif display scale", "Light: Soft window light.", "Color grade: A warm film grade.", "Style world: editorial". The approved brief and BRAND.md say type is "Light, wide, airy sans for headings like the logo; easy-reading body" and light is "Bright and airy, on soft sand." Do: build Type voice, Light, Color grade and Style world from the approved brief (and the picked direction where the brief is silent), not from a fixed default. When the owner asked for a sans heading face, the type voice must not say serif; when a dealt or picked display family conflicts with the owner's stated type wish, the kit and prompts say which wins in plain words (the owner's words win, the direction supplies the rest). Test with these exact answers.

## BUG-081 (S3) Field text is cut mid-word and runs into the next field
prompts\002.md: "...farm pages show only the hero crop labelled "Photos coming soon" un Generated pictures are concept art." and "...Maybe a white version fo Motion score 4 is a starting point." Do: never cut owner text mid-word; when a field must be shortened, cut at a sentence or clause end, and always end each field with terminal punctuation before the next one. Test that no field in a rendered prompt ends mid-word for the Run 11 answers.

## BUG-082 (S4) The Imagine prompt stem carries sourcing and budget text
BRAND.md and src/data/brand.ts imagineStem include "A mix: my own hero; free open-license stock ...; AI stills only to fill gaps. Up to 50 dollars total for AI stills; no video. No video at launch." That is a sourcing and budget answer, not a picture description. Do: keep sourcing and budget in the Imagery section, and build the stem only from the subject, style, light, grade and never-show parts. Test.

## Done when
pnpm typecheck, lint, the touched packages' tests and the new or updated e2e pass. Do not touch other bugs. Never loosen or delete an existing assertion to make it pass.

## Commit
```
fix(app,engine): Desk Run 11 plan follows the picked direction and the approved brief, no mid-word cuts, clean Imagine stem (243f)
```