---
id: "242d"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["242b"]
title: "Desk Run 8 fixes: sitemap edits, style guide from the brand kit, project isolation, real pre-build checks"
---

# 242d. Desk Run 8 fixes

## Why
The desk exists to turn a brief into an Awwwards-calibre, AI-slop-free site that looks stunning on desktop, iOS, Android and tablets, in curated foundry fonts, and is fast. 242b put the design stages ahead of any billed build, and Desk Tester Run 8 (main b0f28954) confirmed that BUG-047, 055, 056, 057, 058, 059, 060 and 062 and the project-name nit are fixed. But the stages themselves don't yet carry the customer's choices through. The sitemap drops most pages and can't be changed, the style guide ignores the brand kit and the picked direction, and the pre-build checks don't check anything real. Opening a saved project also writes it into whichever project is open, which can destroy work. Run 8 evidence is in C:\Users\lucid\Desktop\desk-e2e-run8\ (BUGS.md, BUGS-detail.md, shots\).

Font licenses are NOT verified. Do not add license checks.

## Priority
Fix BUG-063 first (data safety), then BUG-064 and BUG-065 (S2), then BUG-066 (S3), then the two remaining failures (BUG-054, BUG-061). Every bug gets a test that fails before the fix. All tests use a stubbed model, with no Grok spawn and no billed media call.

## BUG-063 (S2) Opening a saved .hhproject loads it into the currently open project
Run 8: the tester created "Paradise Calm" at run8\site, then used Resume project > "Open site" (run7 site.hhproject, sourceDir run7\site). The run7 answers and the approved brief were written into run8\site (brief-yes.json and SITE-BRIEF.md at 23:25). The header still said "Paradise Calm", the run7 folder was untouched, and the old brief approval carried over into the new project (shots\step-004-reopen-run7.png).

Look at: the resume/open handlers in packages/app/src/server/routes.ts, packages/engine/src/project-file/locate.ts, save.ts and schema.ts, packages/cli/src/commands/project-file.ts, and packages/app/src/client/save-status.ts.

Do:
1. Opening a .hhproject switches the session to that project's own folder (its sourceDir, or the folder the file sits in when sourceDir is missing or moved). It loads the answers, approvals and stage state from there, and updates the header, save line and resume rows to that project's display name.
2. Never write an opened project's answers, brief, approvals or design-stage files into another project's folder. Any session state (answers, brief approval, plan approval, design stages, direction) must be keyed to the project root, and switching projects drops the old state from memory.
3. If the sourceDir is missing, show a clear message and offer to relocate. Never silently fall back to the open project.
4. Tests:
   - a route/unit test: create project A, open project B's .hhproject, then assert that A's folder is byte-for-byte unchanged (no brief-yes.json, SITE-BRIEF.md or answers written), that the session root is B, and that the header name is B's
   - a test that B's brief approval does not appear in A after switching back to A
   - a Playwright e2e that creates "Paradise Calm", opens a different saved project from Resume, and asserts that the header, the save line and the files on disk all belong to the opened project

## BUG-064 (S2) The sitemap shows only 4 of 11 pages, and "Change the sitemap" approves instead of changing
Run 8: after plan approval with coverage 25/25 (Farms, About, Contact and the rest), the sitemap read Home, Privacy, Terms and Blog. The tester typed a change and pressed "Change the sitemap". design-stages.json then had sitemap = <the change text>, wireframe.md was generated from the same 4 pages, and the stage advanced (shots\step-008-plan-approved.png, step-011-after-sitemap-change.png).

Look at: packages/engine/src/spec/design-stages.ts, packages/app/src/server/design-stage-desk.ts, `renderDesignStagePanel` and the stage POST routes in packages/app/src/server/routes.ts, and the page list in packages/engine/src/spec/brief-plan.ts.

Do:
1. Build the sitemap from the approved brief's Pages section and the plan's coverage rows, so every brief page appears (Run 8: all 11), with sensible hierarchy (utility pages such as Privacy and Terms in the footer group).
2. "Change the sitemap" applies the requested edit: use the stub-able model call, or a deterministic parser for add/remove/rename/move. It shows the revised sitemap and keeps the stage waiting for approval. Only the approve control records an approval. Never store free change text as the stage's approved value. Apply the same rule to the change controls of the wireframe, style guide and direction stages.
3. Build the wireframe from the latest approved sitemap only. A sitemap change after approval marks the wireframe, and every later stage, as stale and re-opens them.
4. Tests:
   - a unit test with the Run 7/Run 8 brief: the sitemap contains all 11 pages
   - a route test: POSTing a change ("add a Volunteers page under About", "remove Blog") returns a revised sitemap, the stage status stays waiting, and design-stages.json has no approval and no raw change text as the sitemap
   - a test that the wireframe lists exactly the approved sitemap's pages, and goes stale after a later sitemap change
   - a Playwright e2e: approve the plan, see 11 pages, change the sitemap, see the revision with the stage still waiting, approve it, then check the wireframe matches

## BUG-065 (S2) The style guide ignores the brand kit and the picked direction, and specifies 3D for a no-3D site
Run 8: the style guide tokens were paper #f4f1ea, ink #1a1a1a, accent #1f6b4a, display Gambarino and body Author. The brand kit said sand #f3e6d0, gold accent #8a6a12, and Syne + Spline Sans, and the direction picked later was Boska + General Sans. The guide also listed pin, camera travel, FOV and bloom for a motion-4 site with no 3D (shots\step-012-after-wireframe.png).

Look at: the style-guide (DESIGN.md) generation in packages/engine/src/spec/design-stages.ts and packages/app/src/server/design-stage-desk.ts, plus the brand kit and direction state behind /brand.

Do:
1. Generate the style guide from the current brand kit (palette and type) and the picked direction (its palette and font pair). The latest choice wins: a picked direction's pair overrides the kit's dealt pair, and a re-pick regenerates the guide. Never use hard-coded default tokens when a kit or pick exists. Name the source of each token in the guide.
2. Gate the motion and 3D sections on the brief's motion level and 3D answer. A no-3D site gets no camera, FOV, bloom or scroll-pinned 3D tokens. A motion-4 site gets motion tokens that match level 4, and nothing beyond it.
3. Reorder the stages, or regenerate the guide, so the style guide always reflects the direction pick. Either the direction pick comes before the style guide, or a pick after the guide marks it stale and regenerates it. Document the choice.
4. Tests:
   - a unit test with the Run 8 kit: the tokens contain #f3e6d0 and #8a6a12, plus Syne and Spline Sans
   - after picking Boska + General Sans, the guide uses those fonts and no Gambarino or Author
   - for a no-3D, motion-4 brief, the guide contains none of camera, FOV, bloom or pin-3D
   - a Playwright e2e: kit → direction pick → style guide, asserting the shown tokens match the kit and the pick

## BUG-066 (S3) The pre-build checks are thin
Run 8: the checks showed only Plan critique (which restated the brief), "Phone budget before 3D", and "Type picks from the library". The type check listed Gambetta, Erode, Tanker, Clash Display, Switzer and Unbounded rather than the picked Boska + General Sans. There were no device/mobile, WebGL, elevate, AI-look or Awwwards results (shots\step-017-after-direction.png).

Look at: packages/engine/src/spec/prebuild-checks.ts (added in 242b) and the existing engine gates it should call: the type and taste gates (241a), every-device quality (241b), elevate (241l), and the plan critique.

Do:
1. Run real, deterministic pre-build checks on the approved design artefacts (sitemap, wireframe, style guide and picked direction). Each result has pass/warn/fail, specific findings, and a fix hint:
   - Devices: iOS Safari, Android Chrome, tablet and desktop. Check tap targets, viewport/safe-area, type scale at 360/390/768/1440, contrast of the style-guide palette, and that the layout has no hover-only interactions.
   - Mobile performance budget: font weight/bytes for the picked pair, image and hero budget, and the JS/motion budget for the motion level.
   - WebGL/3D: skipped with a reason when the site has no 3D. Otherwise, check the fallback, the reduced-motion handling and the phone budget.
   - Elevate: run the elevate review (241l) on the design and list the top concrete upgrades.
   - AI-look and typography: check against the AI-slop tells (overused fonts, generic gradients, centred-everything heroes, stock phrasing) and the type gates. Check the picked font pair itself (pairing, weights available, x-height and readability at body size). Never check a list of library pairs instead.
   - Awwwards-style quality: score design, usability, creativity and content against the rubric already used in the repo, with a short reason for each.
2. Plan critique must add findings, not restate the brief.
3. "Start build" stays disabled while any check fails. Warnings need an explicit acknowledgement.
4. Tests:
   - a unit test per check with the Run 8 artefacts. The type check names Boska + General Sans and no other pairs. WebGL reports "skipped: no 3D". The device check covers iOS, Android, tablet and desktop.
   - a test that a failing check keeps Start build disabled
   - a Playwright e2e: reach pre-build checks, see every check category with results, and confirm Start build is enabled only when all pass. Do not press Start build.

## BUG-054 (still failing) The DP-2.2 source reads "farm ID.Only ask"
Run 8 (shots\step-006-approve.png): the brief still joins two sentences from different answers without a space ("farm ID.Only ask"). Look at the sentence joining in packages/engine/src/guide/brief-loop.ts and packages/engine/src/spec/brief-plan.ts, and the DP-2.2 handling in packages/engine/src/required.ts, phases/write-back.ts and spec/prd.ts. Fix the join everywhere fragments are concatenated, with one shared helper that adds a single space after terminal punctuation and never doubles it. Tests: the exact Run 7/8 DP-2.2 answers produce "farm ID. Only ask", and a property-style test over every brief section shows no `[.!?][A-Z]` run without a space (URLs, decimals and abbreviations excepted).

## BUG-061 (still failing) Limits contains "In 4 weeks: by November 10, 2026. Yes, that is right."
The 242b fix didn't take. Run 8's Limits section still has the timeline and the filler. Look at the Limits assembly in packages/engine/src/spec/brief-plan.ts and packages/engine/src/guide/brief-loop.ts, and find why the 242b routing isn't reached on the real desk path (is it a different code path from the one the 242b test covers?). Route timeline answers to Timeline, drop confirmations ("Yes, that is right.", "Correct", "That's right"), and keep Limits to actual constraints and never-dos. Tests: drive the exact Run 7/8 answers (DP-8.4, DP-9.1, DP-9.5) through the same path the desk uses (the route, not only the helper), and assert that Limits has no date, no "Yes, that is right", and no "In 4 weeks", and that Timeline has "by November 10, 2026".

## Keep green
Run 8 passes: BUG-047, 055, 056, 057 (brand kit), 058, 059, 060 and 062, and the project-name nit. Keep their tests green. Approve plan must still never call startBuild, ensureSiteBuild or runQueue.

## Rules
Don't deploy, publish, send anything or delete user data. Don't touch Paradise Found's real project or the Desk Tester run folders. Don't start or stop the desk server on port 4175. Never call startBuild or anything billed in a test. Run the full repo checks (tests, lint, typecheck) and the full Playwright suite, and leave them passing. Small, logical commits; finish with the commit below and a clean tree.

## Commit
```
fix(app): sitemap edits, style guide from brand kit, project isolation, real pre-build checks (242d)
```
