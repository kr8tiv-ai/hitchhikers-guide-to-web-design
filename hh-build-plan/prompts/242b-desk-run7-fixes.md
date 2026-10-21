---
id: "242b"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["242a"]
title: "Desk Run 7 fixes: design stages before any billed build (BUG-055), real directions and brand kit, real typeface specimens, and more"
---

# 242b. Desk Run 7 fixes

## Why
The desk exists to turn a brief into an Awwwards-calibre, AI-slop-free site that looks stunning on desktop, iOS, Android and tablets, in curated foundry fonts, and is fast. Type is one of the first real choices a new customer makes, and they make it by eye. If every pair looks the same, they are choosing blind, and the "curated foundry fonts" promise is invisible at the moment it matters most. Desk Tester Run 7 (main 0501c58b) confirmed that BUG-045 and BUG-046 are fixed, but BUG-047 still fails, and the new-project flow has one naming nit.

Font licenses are NOT verified. Do not add license checks.

## Priority
Fix the S1 first: BUG-055 means the person can't approve the design before money is spent. Then the S2s (BUG-056, BUG-057), then BUG-047 and the rest. Every bug gets a test that fails before the fix.

## BUG-055 (S1) The staged approvals and pre-build checks only appear after a billed build has started
Run 7 (main 0501c58b): the brief was approved, 77 prompts were drafted, coverage was 18/18 and "Approve plan" was enabled. The tester stopped there, because in the code `runPlanApprove` → `startBuild` → `ensureSiteBuild` → `runQueue` (packages/engine/src/guide/brief-desk.ts) spawns Grok on prompt 001, which is a billed build. The sitemap, wireframe and style-guide stages only render when `buildStarted` is true (`renderDesignStagePanel` in packages/app/src/server/routes.ts), and the pre-build checks are unreachable without approving the plan. The design is meant to be approved before the build, but today it can only be seen after money is spent. 242a's e2e passed only because the build was stubbed.

Do:
1. "Approve plan" never calls `startBuild`, `ensureSiteBuild`, `runQueue` or anything that spawns Grok or a billed media call. It moves the project into the design stages.
2. Show the stages straight after plan approval, independent of `buildStarted`: sitemap → wireframe → style guide (DESIGN.md) → direction pick → pre-build checks (the gates that can run before a build: plan critique, phone budget before 3D, type picks from the library, and so on). Each is gated on the previous approval, and each has approve and change controls.
3. Add a separate, clearly labelled "Start build" step at the end, enabled only when every stage is approved and the pre-build checks pass. Say plainly that this is the step that starts billed work. That is the only path to `startBuild`.
4. Tests:
   - a unit/route test with a spy on `startBuild`/`runQueue` and the Grok spawn, proving zero calls through plan approval and every stage, and exactly one call after "Start build"
   - a Playwright e2e (extend `new-project-242a.spec.ts`, or add a new spec, with a stubbed model and no billing): brief → plan → sitemap → wireframe → style guide → direction → pre-build checks → Start build, asserting that no build or queue state exists before the last step
   - a test that `renderDesignStagePanel` renders without `buildStarted`

## BUG-056 (S2) Directions are dealt from Astro documentation pages
On /brand after the brief, the Directions list reads "Astro images — Studied page: Astro images (astro-images). https://docs.astro.build/en/guides/images/", "Astro view transitions — ... docs.astro.build/...", and so on. The "studied pages" behind direction dealing are framework docs, not design references. A customer is asked to pick a creative direction named after an Astro docs page (desk-e2e-run7\out\114.txt).

Do: deal directions only from curated design references, meaning the studied library pages (Awwwards/SOTD-calibre sites, the gallery) and the customer's own references (Run 7 named Patagonia, Aesop, Kinfolk, Airbnb Luxe, and Cereal as "meh"). Never deal from docs/knowledge packs such as the Astro, Next or Vite pages. Give each direction a human, mood-led name and a one-line description. Add a filter test that rejects any source URL under a docs host or knowledge-pack path, plus a test that the Run 7 references produce directions tied to them.

## BUG-057 (S2) The brand kit ignores the palette and type answers ("Dealt families: No and Light")
Run 7 answered colours from the hero photo (jungle green, sunset gold, ocean blue, soft sand, near-black green) and fonts as "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body." The brand kit (out\114.txt) says "Dealt families: No and Light." The words "No" and "Light" from the answer were taken as font family names, and the palette answer was ignored.

Do: parse the type answer as intent (none supplied, plus a mood/style description) and deal real pairs from the curated library that match it (light, wide sans display). Only treat words as families when they match a known family. Take the palette from the colour answer (or from the hero image when the answer says so) and show it in the kit. Tests with the exact Run 7 answers: no families named "No" or "Light"; the dealt pairs come from the library and match "light, wide, airy sans"; the palette contains the five named colours.

## BUG-058 (S3) A picked direction can't be changed
After a pick on /brand (a reason is required, `POST /api/direction` returns 200, and decisions.jsonl gets an entry, all good), the pickers vanish, so there's no way to change the choice. Keep the picked direction visible, with a "Change direction" control that shows the dealt set again. Record a re-pick as a new decision entry that supersedes the old one (241l rules: only real choices, each with a reason), and keep rejected-direction handling consistent. Tests: pick, change, re-pick; the log has both entries and the latest wins.

## BUG-059 (S3) /brand says "THE BUILD IS STARTED." when no build exists
/brand showed "THE BUILD IS STARTED." while no build-run or queue existed (before plan approval) (out\116.txt). Drive every status line from real state (build-run/queue files or session state), never from a stage name or a stale flag. Test: before plan approval and during the design stages, the status never says the build started; after "Start build" it does.

## BUG-060 (S3) The coverage table leaves out most pages
Run 7's brief lists 11 pages and many features, but coverage shows 18/18, so most pages have no row. Every page in the brief's Pages section and every feature in Features must have its own row (242a fixed the phantom rows; now make sure none are missing). Test with the Run 7 brief: the row count equals pages + features, and each page name appears.

## BUG-061 (S4) The brief's Limits section mixes timeline and filler with the real limits
The Limits section (out\110.txt) reads: "Privacy and terms pages: yes. Never give legal advice. ... Disclaimer: ... In 4 weeks: by November 10, 2026. Yes, that is right. The caretaker program and a Spanish-first caretaker sign-up matter (Esteban, 61, Android). Office hours Monday to Friday 8:00-17:00 Costa Rica time." The timeline belongs in Timeline. "Yes, that is right." is conversational filler. The caretaker program and the office hours are content or facts, not limits. Check the joins for missing spaces between sentences that come from different answers. Route each answer fragment to its proper section, drop filler confirmations, and keep Limits to actual constraints and never-dos. Test with the Run 7 answers (DP-8.4, DP-9.1, DP-9.5).

## BUG-062 (S4) Counters, status and tour go stale after the interview
After the interview, the desk shows "Question 1 of 1" while the resume row says "61 of 61". Other status lines and the tour also lag. Use one source for progress (answered / total asked, the same one 242a used for resume rows) everywhere: the header, the card, resume rows and the tour. After the interview, show "Interview done (61 of 61)" or the next stage instead of a question counter. Test: after the last answer, every counter agrees and none says "1 of 1".

## BUG-054 remainder: confirm the Vibe sentence fully reads correctly
Run 7's Vibe reads: "The site should feel calm, warm, and honest. It should never feel salesy, cluttered, or loud." That's fixed for this answer shape. Check that the Vibe template can't produce a sentence with a missing subject or slot for other answer shapes: feel only, never only, a single word, and long lists. Add those cases to the test.
## BUG-047 (S3, still failing after 242a) DP-1.5 specimens all render in the same system sans
Run 7 re-test (step 014, desk-e2e-run7\shots\R-047-fonts.png): the DP-1.5 samples now show one "specimen" image per pair, but each image is an inline SVG whose text is set in `font-family=ui-sans-serif` (`specimenSrc` in packages/app/src/card.ts). So every specimen shows the pair's NAME in the same system sans plus the word "Specimen". The "Find your calm" live line (`.hh-type-sample__display`) isn't visible, and the "approximate preview" label stays hidden. A customer still can't see Gambetta vs Tanker. The library part passes: it's still curated, with no overused defaults.

Do:
1. Render each pair in its real typeface. Either embed a subset of the display face in the SVG (an @font-face data URI, containing only the glyphs of the sample line), or outline the sample line's glyphs to SVG paths at build time (for example with opentype.js), so it needs no font at runtime. Prefer outlines when the face's files are available at build time. Cache the generated specimens in the repo or build output, and keep each one small (target under 15 KB per specimen).
2. Each sample shows the line "Find your calm" in the pair's display face, with the pair name and mood words as a small caption in the body face (or the desk's own UI type).
3. Whenever the real face isn't actually rendered (the specimen is missing, or a font fails to load), show the "approximate preview" label. Never show a system-font look without it.
4. Tests:
   - a unit test that every dealt pair has a specimen made from that pair's own face (not `ui-sans-serif` or another system family)
   - a Playwright test that renders DP-1.5 and proves the samples differ per pair: either a pixel diff between specimens (no two identical, above a small threshold), or a check of the computed font-family of the live line against the pair
   - a test that the label appears when a specimen is forced to fail
5. Check the result against R-047-fonts.png: Gambetta must read as a quiet editorial serif, and Tanker as a heavy display face.

## Nit: the new project shows the folder name, not the typed name
Run 7: on the New project screen the tester typed the name "Paradise Calm" and the folder `site\`. The desk shows the project as "site". Store the typed name as the project's display name (in the project file and session), show it everywhere the project name appears (header, save line, resume rows), and only fall back to the folder name when no name was given. Test: create "Paradise Calm" in `site\` and assert the desk shows "Paradise Calm" after create, after reload, and in the resume list.

## More bugs from Desk Tester Run 7
BUG-055 to BUG-062 and the BUG-054 remainder are listed above, in priority order. Run 7 re-tests that passed: BUG-045, 046, 048, 050, 051, 052, 053, the DP-4.3 repeat, BUG-021, BUG-022 and the mic. Keep their tests green.

## Rules
Don't deploy, publish, send anything or delete user data. Don't touch Paradise Found's real project. Don't start or stop the desk server on port 4175. Run the full repo checks (tests, lint, typecheck) and the full Playwright suite, and leave them passing. Small, logical commits; finish with the commit below and a clean tree.

## Commit
```
fix(app): design stages gate the billed build, real directions and brand kit, typeface specimens (242b)
```