---
id: "242a"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["241l"]
title: "Desk Run 6 fixes: BUG-046 new-project flow and refuse own repo, BUG-045 DP-1.1 logo confirm"
---

# 242a. Desk Run 6 fixes

## Why
The desk exists to turn a brief into an Awwwards-calibre, AI-slop-free site that looks stunning on desktop, iOS, Android and tablets, in curated foundry fonts, and is fast. A person can only get there if the desk starts them in the right place and listens to what they already said. Desk Tester Run 6 (main 2febc27a, desk on port 4175) found that a fresh desk has no way to start a new project and silently runs the interview inside the tool's own source repo, and that the interview asks again for something the person has just told it. The first would make a later build write the site into the desk's own repo; the second makes the desk feel like it isn't listening.

Font licenses are NOT verified. Do not add license checks.

## Priority
Fix the S1 first: BUG-051 blocks every new project at the brief. Then the S2s (BUG-046, BUG-052, BUG-053), then the rest. The end-to-end test at the bottom is the definition of done.

## BUG-051 (S1) Brief "Approve" is permanently disabled: the plan-coverage gate needs build prompts that only exist after the brief is approved
Repro: finish the interview (61 answers), draft the Site Brief, open /approve. The page shows the brief, then "Plan coverage: 0 of 32 pages and features covered", with every row "PROMPTS None / Uncovered" and "Approve stays off until every row is covered." The Approve button (name=action value=approve) is disabled. /hh-dashboard says "No plan is on the desk... The plan lands here after you approve the prompts." /brand only offers "Review the Site Brief". Nothing drafts the plan, so every new project dead-ends at the brief. Run 5 (e16a8b78) worked: approve brief → plan → coverage table → approve plan.

Do:
1. Restore that order. The brief approval is not gated on plan coverage. Approving the brief drafts the plan (the prompt queue). The coverage table and its "every row covered" gate apply to approving the plan, not the brief.
2. Find which change moved the gate (`git log -S` on the coverage gate and the /approve route, from e16a8b78 to 2febc27a). Keep whatever it was meant to add, in the right place.
3. Make the desk always show the next action at each step: after the brief, "Draft the plan" or its running state; after the plan, the coverage table with Approve plan.
4. Tests: brief Approve is enabled with no plan; approving the brief drafts the plan; plan Approve stays off until coverage is full, then turns on.

## BUG-052 (S2) The coverage table invents pages from the Limits text
Repro: answers mention, in the Limits context, "never promise title, price, residency or returns", "Asking price, set by the seller", "by November 10, 2026" and "Yes, that is right". The coverage table has 32 rows instead of 25 (11 pages + 14 features). The 7 phantom rows are REQ-PAGE-yes, -price, -residency, -returns, -set-by-the-seller (with a stray closing quote in its label), -2026 and -that-is-right, all parsed out of the Limits paragraph. "Change something" rewrote the Pages section correctly, but the phantom rows stayed because Limits still holds those words.

Do:
1. Take requirements only from the brief's Pages and Features sections (structured, not scanned from prose). Limits, Vibe and the other sections never create rows.
2. When "Change something" edits Pages or Features, recompute the requirements.
3. Tests: the Run 6 answers give exactly the 11 pages and 14 features; Limits words never become pages; labels have no stray quotes.
4. While you're there: the header says "Covered 62 of 62 answers" against 61 questions. Use one source for the count (same root cause as BUG-050 item 3).

## BUG-053 (S2) The staged approvals (sitemap → wireframe → style guide) and the direction picker can't be reached from the desk
After the brief, no page shows a sitemap, wireframe or style guide stage. `.hitchhiker` has no sitemap.md, wireframe.md, design-stages.json or directions.json. In the source, `advanceDesignStages` / `emitDesignStages` (packages/engine/src/spec/design-stages.ts, interview.ts) are only called from engine tests, never from an app route or CLI command. `renderDirectionPicker` (app/src/server/direction-desk.ts) returns "" until `.hitchhiker/directions.json` exists, and that file is only written by the brand-kit step (kit-from-interview.ts) behind the BUG-051 block. So `POST /api/direction` has never been called in a real run. This contradicts the 241k/241l wiring table, which claimed these were wired.

Do:
1. Wire the stages into the real desk flow after the brief/plan approval: the sitemap for approve or change, then the wireframe, then the style guide (DESIGN.md), each gated on the previous approval. Write `design-stages.json`, `sitemap.md` and `wireframe.md` to the project.
2. Make the direction picker reachable in the flow (directions dealt and shown at the right stage), posting to `/api/direction` and writing the decision log from the person's real choice (241l rules: never invent a pick).
3. Add a test that fails if `advanceDesignStages`, `emitDesignStages` or the direction picker loses its production caller (an app route or server handler must call it, not just a test). Correct the wiring rows in hh-build-plan/research/241k-sweep-report.md to match.

### BUG-054 (S4) The brief's Vibe section has a broken sentence
DP-5.3 answer: "Feel: calm, warm, honest. Never: salesy, cluttered, loud." The Vibe section reads "It should never feel salesy, cluttered, or loud. is the test for the words, the space, and the photos." The subject is missing. It should read something like "Calm, warm, and honest is the test for the words, the space, and the photos." Fix the template so a sentence never starts with a missing slot (drop or rephrase the sentence when the slot is empty), and add a test with the Run 6 answer.

### Soft: DP-4.3 asks about the blog again after DP-3.5 already answered it
Skip or confirm DP-4.3 when DP-3.5 already covered the blog, using the same confirm pattern as BUG-045.
## BUG-046 (S2) No new-project flow; without --project the desk uses its own source worktree
Repro: start the desk with `hh app --port 4175 --no-open` and no `--project` from a checkout of this repo (for example C:\Users\lucid\hh-desk-run). Open the desk. It shows the worktree's folder name ("hh-desk-run") as the project and question 1 of 61 straight away, and writes answers to `<repo>\.hitchhiker\`. The only project actions are Save project, Resume project, Open the sample and "Open project folder". "Open project folder" needs a .hhproject path: submitting it empty goes to a "Name a project file / The open form did not include a path" page, and `POST /api/project/open` returns 400.

Do:
1. First run. When the desk starts with no project (or with a project dir that is the desk's own repo), don't start the interview. Show a first-run screen that asks for a project name and a folder (default to a sensible location such as `~/Hitchhiker Sites/<slug>`), with a choice to open an existing project instead.
2. A "New project" action, always available from the project actions. It creates the project the same way /hh-new does (project folder, `.hitchhiker/`, home index), then switches the desk to it and starts the interview there.
3. Refuse the desk's own repo as a site project. Detect it robustly (for example, the repo root that contains this desk's own package, including other git worktrees of the same repo, and any folder inside it). Refuse it in `--project`, New project, Open and Resume with a clear message that says why and what to do instead. Never write `.hitchhiker/` there.
4. "Open project folder" with an empty path: don't send the request. Validate in the form with an inline message ("Choose a project folder or .hhproject file"). Make the server answer an empty or missing path with a friendly in-desk error, not a dead-end page. Remove or replace the "The open form did not include a path" page so the person always lands back on the desk with a way forward.
5. Tests: first run with no project shows the name and folder prompt and no interview; New project creates the layout and switches; own repo and own worktrees are refused on every entry point; the empty open path is blocked client-side and the server responds without the dead-end page.

## BUG-045 (S4) DP-1.1 asks "Do you have a logo?" right after its recap says the person described one
Repro: new interview. At DP-0.4 ("Do you already have a logo, colors, fonts, or photos?") answer "Logo file: paradise-found-logo.png. Yes: logo, mark and hero photo attached. No fonts yet. Colors from the hero photo: jungle green, sunset gold, ocean blue, plus soft sand and a near-black green." Answer DP-0.5 and DP-0.7. DP-1.1's headline is "Do you have a logo?", while the recap under it says "You already described a logo, a mark, and a hero photo...", and a logo-file drop zone is shown.

Do:
1. When the earlier answers already say there is a logo, DP-1.1 confirms it instead of asking. Use the same pattern DP-1.2 uses for colors ("You can keep the five from the hero"). For example: "You said you have a logo (paradise-found-logo.png). Drop the file here, or tell us if you want a variant."
2. If the file hasn't been attached yet, ask for the file ("Drop the logo you described"). If it has been attached, show it and ask to keep it or change it. Only ask "Do you have a logo?" when nothing earlier mentions one.
3. Make the headline and the recap come from the same source of truth so they can't contradict each other. Apply this to any other DP card that has the same ask-again pattern.
4. Tests for: logo mentioned with no file, logo mentioned with a file, and no mention.

## More bugs from Desk Tester
(Any further bugs from Run 6 are appended below.)

### BUG-047 (S3) DP-1.5 font samples are drawn in system stand-in fonts, so a card shows a look that is not the pair it names
Repro: answer the interview up to DP-1.5 ("Do you have fonts you use? If not, pick a style from these examples."). The six "Find your calm" samples use system stacks (`fontExamplesHtml` in packages/app/src/card.ts: "System stacks stand in so the card does not load a font file."). "Gambetta + Synonym / editorial, quiet, publishing" renders as heavy condensed all-caps (Impact-like), the opposite of a quiet editorial serif. Tanker, Clash Display and Erode look like the same plain sans. A brand-new customer picks by look, so the pick can contradict the label. The six samples are also fixed rather than dealt from the customer's mood words.

Do:
1. Render each sample in the real pair it names. Load a subset of each display face (just the glyphs of the sample line, self-hosted or from the foundry's CDN, with `font-display: swap`), or ship a pre-rendered SVG/PNG specimen per pair. Keep the card fast: no full font families, and measure the page weight.
2. If a face can't load, show the specimen image, never a misleading system stand-in. Only use a stand-in with a visible "approximate preview" label.
3. Deal the samples from the curated library (packages/engine/src/brand/type-library.ts) using the customer's mood words where they exist, still never offering the overused defaults.
4. Tests: every sample names a pair in the library and references its real face or specimen; no overused defaults; the fallback carries the label.

### BUG-048 (S4) The save status stays "Not saved · No save yet" during the interview, although the project autosaves after every answer
Repro: open the desk and answer questions without reloading (Run 6 answered 20). The project panel under the card keeps "hh-desk-run  Not saved · No save yet", while `<project>.hhproject` was written after each answer (README: "After an answer ... the desk writes <project>.hhproject"). A fresh GET / shows "Saved ·", so only the in-page status is stale. A customer would think the work isn't saved.

Do:
1. Update the save status in the page after each answer round-trip, and after Save, Resume and New project, from the server's real save result (time of the last successful write). Show "Saved · <time>" on success and a clear error if the write failed.
2. Test: answer a question and assert that the in-page status changes to Saved with the new time, without a reload; a failed write shows the error.

### BUG-049 (S3) DP-8.1 headline starts mid-quote: 'Find your calm." Do you have the words for the site...'
Repro: at DP-1.3 give the tagline as: Yes: "Paradise Found. Find your calm." Continue to DP-8.1. The `#hh-card-ask` text is exactly: `Find your calm." Do you have the words for the site, or should the Guide write them for you to approve?` The lead-in was split at the period inside the quoted tagline, so the headline opens with a fragment and a stray closing quote. The first half ('...set "Paradise Found.') lands in the recap above it. This is the same family as BUG-035 (heading split/join artifacts).

Do:
1. Make the heading/recap sentence splitter quote-aware: never split inside "...", '...', “...” or ‘...’, or inside parentheses. Better still, take the ask from a structured question field, where the card has one, instead of splitting prose. Apply this to every card, not just DP-8.1.
2. Guarantee that the heading is a whole question: it doesn't start with a closing quote or a lowercase fragment, and it ends with "?". If the guarantee fails, fall back to the plain question text.
3. Tests: a tagline with an inner period and quotes; nested and curly quotes; the BUG-035 cases still pass.
### BUG-050 (S3) The "Resume project" list rows can't be opened, and show raw UTC timestamps
Repro: press Save project, reload, then press "Resume project". Each row in `<details class="hh-project__resume">` renders as `<li class="hh-save-resume__row"><p class="hh-title">hh-desk-run</p><p class="hh-small">2026-10-20T20:18:37.493Z · question 62 of 62 · Desktop</p></li>`. There's no button, link or form, so clicking does nothing. Times are raw UTC ISO strings. The count says "question 62 of 62", while the desk showed "Question N of 61". The only working way to reopen is pasting the .hhproject path into "Project file path" and pressing "Open project folder".

Do:
1. Make each row a real control (a button, or a link to the open route) that reopens that project with its state intact, the same as open-by-path does. Make it keyboard-accessible and labelled. A missing file shows a friendly message and drops the row (as resume-list.spec expects).
2. Show local times in the person's zone, in the same format as the save line ("Today 14:18", or a date for older saves).
3. Make the question count match the desk's own count ("question N of 61"). Find out why the total differs (62 vs 61) and make both use one source.
4. Tests: clicking a row reopens that project; local time format; the count matches the card's count; the BUG-046 own-repo refusal also applies to resume rows.
### CI: E2E (Playwright) failed twice on 2febc27a
Both E2E runs on 2febc27a (241l) failed; the E2E runs on 31bcb94d and earlier passed.
- Run 39467274392 failed while installing the browser: `playwright install --with-deps chromium` (.github/workflows/e2e.yml line 49) ran apt, and apt hit `403 Forbidden` on `https://packages.microsoft.com/ubuntu/24.04/prod/dists/noble/InRelease`, so it exited with code 100. That was an outside mirror outage, but one third-party apt source shouldn't be able to fail our E2E.
- Run 39467264703 ran: 168 passed, 1 failed. The failure was `e2e/question-032.spec.ts:17` "DP-9.3 shows the question as the heading and the recap below". At line 36, `heading.boundingBox()` returned null: the heading wasn't visible or attached when it was measured.

Do:
1. Harden the browser install in e2e.yml. Before `--with-deps`, remove or disable apt sources the job doesn't need (for example the packages.microsoft.com list), or `apt-get update` with retries. Cache the Playwright browsers keyed by the Playwright version. Retry the install a bounded number of times. Keep failures loud: if it still can't install, fail with a clear message.
2. question-032. Find the root cause. Either it's a race (measuring before the DP-9.3 card has rendered: wait on the visible heading with `expect(heading).toBeVisible()` before `boundingBox()`), or it's a real regression from 241l's changes to the interview and design stages (the DP-9.3 heading or recap no longer renders, or renders elsewhere). Fix the product if it's a regression, and the test if it's a race. Then run the spec 10 times locally with `--repeat-each=10`, plus the full E2E suite once, and record the results in the commit message.
3. The rerun of 39467264703 (failed jobs only) failed on a different test. question-032 passed this time, so the DP-9.3 failure is a timing flake, not a steady regression. The new failure was `e2e/live-guide.spec.ts:11` "replays ten Towel and Tea turns at 375, including pushback, four cards, and brief approval". At line 74 a computed style was "none" where the test expected anything else. That looks like a CSS `display`/animation check made before the reveal settled; it's near `roundTripGallery`. Make both specs wait on a settled state (a web-first `expect` on visibility or on the final style, or an explicit settled marker from the page) instead of reading once. Then sweep the other e2e specs for the same one-shot `boundingBox()`/`getComputedStyle` pattern and fix them the same way. Done when the full E2E suite passes 3 times in a row locally and once in CI.4. The rerun of 39467274392 got past the install this time; the apt 403 was transient. The tests then failed on two specs: `live-guide.spec.ts:11` again, now as `expect(locator).toBeFocused() failed`, and `e2e/reveals.spec.ts:27` "brand and journey reveals settle at 375 and 1440". live-guide has now failed in 2 of the 3 runs on 2febc27a, and all of these specs passed on 31bcb94d (241k). So treat this as a probable regression from 241l, most likely its interview or design-stage and direction-choice changes affecting focus, card leads or reveal timing. Check that first with `git diff 31bcb94d 2febc27a -- packages/app packages/engine`, and fix the product if it's the cause. Only then harden the waits.
## Definition of done: an end-to-end new-project test
Add a Playwright e2e (stubbed model/media, offline, no billed calls) that goes through New project (BUG-046) → the interview (a short answer set) → the brief → Approve brief (BUG-051) → the plan drafted → full coverage with only real pages and features (BUG-052) → Approve plan → the sitemap, wireframe and style guide stages and the direction picker (BUG-053), approving each. The project must be in its own folder, never the desk repo. It must pass in CI and 3 times in a row locally.
## Rules
Don't deploy, publish, send anything or delete user data. Don't touch Paradise Found's real project. Don't start or stop the desk server on port 4175. Run the full repo checks (tests, lint, typecheck) and leave them passing. Small, logical commits; finish with the commit below and a clean tree.

## Commit
```
fix(app): Desk Run 6 fixes - brief then plan approval, real coverage rows, design stages wired, new-project flow, and E2E (242a)
```





