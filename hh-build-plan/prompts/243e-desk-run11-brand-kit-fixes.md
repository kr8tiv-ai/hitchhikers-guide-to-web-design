---
id: "243e"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243d"]
title: "Desk Run 11 brand kit fixes: kit ignores the approved brief, wrong Action and Motion answers, missing type adjectives, double period, no direction picker on Approvals"
---

# 243e. Desk Run 11 brand kit fixes

## Why
Desk Tester Run 11 (branch desk-run11-fixes at d474b52f, project "Paradise Found Run Eleven C" in C:\Users\lucid\Desktop\desk-e2e-run11\site-c) re-tested BUG-070 to BUG-074 on 2026-10-26, approved the Site Brief in the desk and pressed Draft the plan. The Brand kit shown on /approve (written by packages/engine/src/brand/kit-from-interview.ts brandKitFromAnswers / writeBrandKit) has four bugs that would carry wrong facts into the build. Evidence: site-c\.hitchhiker\SITE-BRIEF.md (approved; brief-yes.json), interview.json, brand\BRAND.md, directions.json. Write the failing test first for each bug, then fix. All tests use a stubbed model: no Grok spawn, no billed call.

## BUG-075 (S2) The brand kit reads raw answers by fixed id and ignores the approved Site Brief
- Motion: the kit takes only DP-6.2, which is "4.", so BRAND.md Motion reads "4. Sound stays off." It drops what the approved brief Motion field says (medium appetite 4 of 10, gentle parallax on the hero photo only, no video file, farm cards fade in one after another at about 400 ms, everything still under reduced motion, home opens calmly then visitors pick Farms, Live on the Land or How Buying Works).
- Action: the kit takes DP-3.1 (the contact-forms answer, "Yes. A general contact form plus the farm inquiry form...") so Offer reads "...the caretaker match is free. Action: Yes. A general contact form...". The site's primary action is DP-2.2 / the brief Action field ("The visitor sends an inquiry about one farm they can see. The form is prefilled with that farm ID.").
- Edits made through Change something on the brief never reach the kit.

Do: when an approved Site Brief exists, build the brand kit fields (Offer, Action, Motion, Imagery, Voice, Vibe, References, Type and Colour wording) from the approved brief field text, falling back to the raw answers only for a field the brief does not have. Never print a bare score such as "4." as the Motion text; when Motion only has a score, write it as "Motion appetite 4 of 10." Keep src/data/brand.ts in step with BRAND.md (same action and offer). Tests: a kit built with an approved brief like Run 11 has a Motion section containing parallax, 400 ms and reduced motion, and its Action is the farm inquiry, not "Yes. A general contact form"; a brief edit to Motion shows up in the kit; with no approved brief the existing brand-kit-239 behaviour still holds.

## BUG-076 (S3) Type adjectives come out as "none" when the owner described the type
DP-1.5 was "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings." BRAND.md reads "Adjectives: none." Do: take adjectives from the owner's description (here light, wide, airy) when no font is named, and let them steer the dealt families. Test with this exact answer.

## BUG-077 (S4) Double period in the Imagine prompt stem
Light "Bright and airy, on soft sand." gives "Light: Bright and airy, on soft sand.. Grade:". Do: join parts without doubling terminal punctuation everywhere in the stem and in the Light line. Test.

## BUG-078 (S3) Approvals shows "Directions. Pick one." with no way to pick
/approve renders the Brand kit "## Directions / Pick one." list, but the direction picker (packages/app/src/server/direction-desk.ts renderDirectionPicker, injected by withDirectionDesk in routes.ts) only appears on / and /brand, so on the page where Approve plan sits there is no pick control. Do: on /approve, when the deal has no pick yet, show the same picker (or one clear link to it) next to the Brand kit, and when a direction is picked, the Brand kit says which one. Do not change what Approve plan does. Test with an app render or e2e test.

## Done when
pnpm typecheck, lint, the touched packages' tests and the new or updated e2e pass. Do not touch other bugs. Never loosen or delete an existing assertion to make it pass.

## Commit
```
fix(app,engine): Desk Run 11 brand kit follows the approved brief, type adjectives, stem punctuation and direction pick on Approvals (243e)
```