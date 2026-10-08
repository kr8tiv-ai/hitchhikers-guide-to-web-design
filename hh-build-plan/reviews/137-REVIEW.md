# 137 Review — prompts 134, 135, 136

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. No fix commits. No new feature. Mostly Harmless does not close here (`phase_end: false`; the phase checkpoint is 139).

The must-have truths for 134, 135, and 136 hold. Each one below has a test name and a file line. Two product-path limits stay as known issues: the before-jump desk does not call the 011 adapter unless a caller passes `think`, and the shared card's Suggest and Hold to talk controls are not wired to a model or to voice. Prompt 134's parenthetical "server (046)" names the archetype prompt. The companion server is prompt 034. The file list puts the cards in their own loopback module, and that is what shipped.

## History

Build commits are in prompt order. Each build message matches that prompt's commit line. Each commit has one parent. History was not rewritten. At review start `main` was ahead of `origin/main` by these three builds, so they were not published. This session does not push.

| Order | Commit | Parent | Message | Role |
| --- | --- | --- | --- | --- |
| 1 | `7e998a0` | `a275be1` (133 review) | `feat(phases): before-we-jump questions at every phase start` | prompt 134 |
| 2 | `6656fcc` | `7e998a0` | `test: add the Towel and Tea fixture` | prompt 135 |
| 3 | `eca6fae` | `6656fcc` | `test: dogfood Towel and Tea through the compilers` | prompt 136 |

HEAD at review start was `eca6fae`. The working tree was clean. `.hitchhiker-dev/summaries` is absent, so the commit bodies are the summaries. No package was added. `@theatre/studio` is absent.

Prompt 134 also edits `packages/engine/src/index.ts` (lines 187–188), exporting `onPhaseStart` and `savePartial`. The commit body names that file. The prompt allows a harness export outside the file list. Prompts 135 and 136 touch only their listed files.

## 134 Before-we-jump at every phase start

### Truths

- Every phase starts with a chance to fix gaps. `onPhaseStart` accepts `babel-fish`, `deep-thought`, `improbability-drive`, `mostly-harmless`, and `so-long` (`packages/engine/src/phases/before-jump-hook.ts` lines 46–52 and 90–97). It builds the list with `beforeWeJump` from prompt 132 (line 106), drops the three announcement fillers (lines 56–60 and 113), and drops any question that matches `testimonial` (line 113). Zero real gaps call `ask` with one card whose ask is `Nothing open. Jumping.` and return `asked: 0` (lines 134–137 and 334–343). Open gaps are shown, at most eight (line 123). Test `every phase start uses the same file-built list` (`packages/engine/test/before-jump-hook.test.ts` line 481) runs all five phases, requires length 1 to 8, the phase name in the why line, and the same ids. Test `a closed project shows the jump card and asks nothing` (line 354) requires that single jump card, zero writes, and none of the three fillers. Test `two real gaps drop the filler and land in the owning files` (line 387) requires the logo card and the legal card, and rejects a filler and a testimonial. Playwright test `Deep Thought answers two open items at both viewports` (`packages/app/e2e/before-jump.spec.ts` line 14) answers both cards. Playwright test `zero open items shows the jump card and asks nothing` (line 72) requires the jump sentence and an unchanged `interview.json`.

- Nothing answered is asked twice. After a successful write, the card id is stored on `before-we-jump.json` and `readAnsweredIds` skips it (`before-jump-hook.ts` lines 105–117; `packages/engine/src/phases/write-back.ts` lines 190–197 and 233–239). `ANSWERED` rows appended to `interview.json` are settled for the 132 generator (`write-back.ts` lines 578–581). A skip and a jump do not enter that answered set (`write-back.ts` lines 86–87). Test `two real gaps drop the filler and land in the owning files` calls `onPhaseStart` again and requires `asked: 0` with neither `brand:logo` nor `legal` (before-jump-hook.test.ts lines 412–419). Test `an Express ASSUMED default is re-asked once and then stored` (line 425) requires `DP-0.5` on the first Babel Fish start and requires it absent on the next Mostly Harmless start, with the interview status `ANSWERED`. Test `jump stops the rest of the cards and skip does not count as answered` (line 679) requires the skipped legal card to come back.

- Answers write back to their owning files. `writeBack` maps brief, brand, voice, motion, stack, and deploy, and wraps the replace in `withStateLock` (`write-back.ts` lines 85–126 and 242–270). Brief text goes through `renderBrief`. Voice goes through `renderVoice`. Motion goes through `planMotion`. Stack goes through `decideStack`. Deploy target also calls `saveConfig`, which takes the same lock itself, so that call sits outside this function's lock (lines 119–124). An approved brand or voice section returns `blocked:<section>` until `reopenSection` names it (lines 502–507). Test `writeBack stores a brief field in SITE-BRIEF and interview.json` (before-jump-hook.test.ts line 144). Test `writeBack splices a brand section without approving it` (line 188). Test `writeBack renders VOICE.md through the voice writer` (line 211). Test `writeBack renders MOTION.md through the motion planner` (line 232). Test `writeBack renders STACK-DECISION through decideStack` (line 252). Test `writeBack stores deploy settings and the config target` (line 273). Test `writeBack refuses an approved section until it is reopened` (line 306) requires the brand file byte-for-byte unchanged. Test `writeBack throws while the state lock is held and leaves files untouched` (line 328). The Playwright spec requires the brass wordmark in `BRAND.md` and the legal line in `SITE-BRIEF.md`, with `logo` still unapproved.

### Key links

`onPhaseStart` calls `beforeWeJump` (before-jump-hook.ts line 106). The page renders a real question with `renderCard` from `packages/app/src/card.ts` (`packages/app/src/before-jump/cards.ts` lines 440–458). The shell, tokens, type, components, and card stylesheets are the Guide design system (cards.ts lines 35–41 and 396–402). The server binds `127.0.0.1` and rejects any other host (lines 200–202 and 533–538). It is a sibling of the prompt 034 desk, which is the file the prompt's list allows.

### Also checked

Express `ASSUMED:` rows are re-asked. The fixture in the Express test is `DP-0.5` with status `SKIPPED` and value `ASSUMED: No X connection.`, and the card ask matches `Express default` (before-jump-hook.test.ts lines 430–443). That matches CONTEXT-PACKAGE v2's Express rule and Q26's phase follow-up.

More than eight open items: the hook keeps eight cards and writes an `ASSUMED` overflow note (before-jump-hook.ts lines 120–132). Test `more than eight open items keep eight and list the rest as ASSUMED` (before-jump-hook.test.ts line 507) requires length 8, an overflow card, and a note that ends `Status: ASSUMED.` Prompt 132 does not return the dropped question texts, so the note is a count.

An answer that would change an approved section is held. `blockingSection` catches a direct brand or voice target (write-back.ts lines 496–507). A model verdict can name another approved section (`before-jump-hook.ts` lines 195–222). Either path asks `Reopen that approval?` and writes only when the reply starts with `yes` or `reopen` (lines 158–172 and 408–409). Test `a contradicting answer asks before reopening an approved section` (before-jump-hook.test.ts line 544). Test `declining a reopen leaves the approved section untouched` (line 578). Test `a cross-file contradiction can reopen the named approval` (line 610).

A close mid-list keeps answers already given. The page calls `savePartial` before it advances (`cards.ts` lines 319–325). The next `onPhaseStart` drains that file through `writeBack` (before-jump-hook.ts lines 179–192). Test `answers saved before a close return for the ones still open` (before-jump-hook.test.ts line 639).

### UI

Prompt 134 is the only prompt in this group that changes `packages/app/`. I opened the loopback page in Chromium, light scheme, reduced motion, at 375×812 and 1440×900, for the two-gap question and for the jump card.

The page uses Desk Lamp. Computed surface is `rgb(243, 235, 221)` (`#f3ebdd`) and the title ink is `rgb(28, 22, 18)` (`#1c1612`). The title font is Bricolage Grotesque. The Don't Panic wordmark is the design-system mask (336px wide at 375, 544px at 1440). The accent is the rust focus rule and the filled Jump button. At 375 the phase map sits under the card. At 1440 the card and the map are two columns. `scrollWidth` stays within `clientWidth` at both widths. Body text has no exclamation mark, no "elevate", no lorem, and no indigo. There is no purple gradient and no magnetic button.

The two-gap Playwright test fills both answers and checks the files. I also clicked Suggest for me: the draft becomes `Name the concrete change.` and nothing is posted. See Known issues.

## 135 Freeze the Towel and Tea eval fixture

### Truths

- Evals have a frozen fictional client. `evals/towel-and-tea/transcript.json` names `Towel & Tea` and `fictional loose-leaf shop`. The six turns are the required ids. `expected-brief.json` stores the same strings: the site why, `Visitor wants a tin.`, action `buy`, `earthy. Anti-vibe is neon.`, the motion skip default `3. ASSUMED. Polished, not a spectacle.`, and hosting `no idea`. `expected-brand.json` stores paper `#f4f0e6` and ink `#1c1915`. `loadFixture` lives in the test file, so the engine gains no production loader (`packages/engine/test/towel-tea.test.ts` lines 76–80). Test `the Towel and Tea fixture fills every required id` (line 97) requires the turn ids and the brief keys to equal `requiredIds()` from `packages/engine/src/required.ts`, `missingRequired` empty, every value non-empty, motion `SKIPPED` with the tree `skipDefault`, and the other five `ANSWERED`. Test `replay through the brief and why compilers matches the fixture` (line 133) runs `renderBrief` and `compileWhy` and requires the site why, status `ASSUMED`, and the coverage line `5 answered, 0 suggested, 1 skipped, 0 soft, 0 imported.`

- The fixture contains no secrets and no real personal data. The three JSON files contain no email, no street address, no person's name, no key, and no `Date.now`. The visitor line is `Visitor wants a tin.` Test `the fixture has no exclamation, no email, no Aura Homes, and no live call` (towel-tea.test.ts line 160) rejects `!`, an email pattern, `Aura Homes`, `Date.now`, `fetch(`, `xai-`, `Bearer `, and `sk-`. Test `expected ink on paper clears body contrast` (line 153) requires `contrastRatio` at least 4.5 and `passes(ratio, "body")`.

### Key link

Expected fields match the required id list. The brief keys and the transcript ids are both asserted equal to `requiredIds()` (towel-tea.test.ts lines 104–108). That list is `DP-2.1`, `DP-2.6`, `DP-2.2`, `DP-5.3`, `DP-6.2`, `DP-9.2`.

### Also checked

The test file imports no network client and does not call `think`. Aura Homes is absent. The prompt forbids a readme, and none was added. No production API was added.

## 136 Replay Towel and Tea through brief and brand compilers

### Truths

- The fixture survives a compiler replay. Test `replay Towel and Tea through the brief, brand, and motion compilers` (`packages/engine/test/dogfood.test.ts` line 201) loads `transcript.json`, `expected-brief.json`, and `expected-brand.json`. It runs `compileWhy`, `renderVoice`, `compileBrand`, `renderBrief`, `renderPrd` (line 283), `lintClaims` (line 294), `decideStack`, and `planMotion` (line 305). The why equals the brief's `DP-2.1`. The PRD assumptions section lists the skipped motion line, and the deploy section contains `Hosting: no idea.` `lintClaims` on the PRD markdown returns `ok` with an empty hit list. Appetite is the skip default `3`. `planMotion` on one `light-reveal` assigns only `css-scroll` or `vanilla`. The test requires `three` and `theatre` absent from the assignments and from the warnings (lines 312–322). `decideStack` with an empty site type returns `astro`. `summarizeDogfood` reports the site why, hosting `no idea`, the libraries, and `prdHasAssumptions: true` (lines 324–334). Test `summarizeDogfood reads the latest why and hosting and the assumptions list` (line 337) locks the latest-record rule and a missing assumptions list.

- Dogfood does not need a live model. The test file imports the compilers and does not import `think`, `fetch`, or `node:child_process`. The story pack is built with `positioningLine`, `pickArchetype`, and `expandOnly` because the fixture has no `DP-2.7` (dogfood.test.ts lines 174–198). The compilers are called as they are. The fixture file was left frozen. There is no try/catch around the assertions.

### Key link

The replay test calls `renderPrd` (line 283), `planMotion` (line 305), and reads the three fixture files (lines 202–206).

### Also checked

The phone-path sentences are present on this calm replay: the PRD contains `A phone receives the phone path.` (dogfood.test.ts line 292) and the motion plan contains `Effects at level 6 and above keep a calm phone path.` (line 319). Those sentences are standing lines in `renderPrd` and `planMotion` for every site. The assertion that fails if this appetite picks a heavy library is the `three` / `theatre` check, not the standing sentence. The test still fails if either sentence disappears.

The truth linter is `lintClaims` in `packages/engine/src/brand/truth.ts`. It flags star ratings, percents, `award-winning`, and a testimonials heading. A clean result on this PRD means those patterns are absent, which the empty `hits` array locks.

No prompt in this group starts the orchestrator. The dogfood test is the runner.

## Live model calls

D-003 names the interview, brand modules, the reviewer, and Elevate. It does not name Before-we-jump. Q26 asks for follow-up questions at each phase start. It does not ask for a live model call. Prompt 134's signature still takes `think: typeof think`, and the hook uses it.

`findContradiction` sends task `before-jump-contradiction`, `CONTRADICTION_SCHEMA`, and effort `medium` (before-jump-hook.ts lines 81–88 and 206–218). A direct approved-section write is blocked before that call. The cross-file test injects a function that returns `{ contradicts: true, section: "purpose" }`. It does not enter `packages/engine/src/ai/think.ts`, and there is no cassette.

`startBeforeJumpServer` defaults to `quietThink` (cards.ts lines 72–82 and 149). That function returns `{ contradicts: false, section: "" }` and `cassette: "hit"` without reading a cassette and without spawning. The imported `think` adapter is unused on that path. See Known issues. This review did not switch the default. A live default would be a new product surface the prompt steps do not describe, and a missing `grok` binary would stop the phase whenever an approved section exists.

Prompts 135 and 136 forbid a live call. Their tests do not make one.

## Known issues

- The before-jump desk's default `think` is a fixed "no contradiction" result. Cross-file reopening works when the caller passes `think`. The product server does not. Direct approved-section blocks still work without a model, and those tests pass. There is no cassette through the 011 adapter. Left as a known issue. Matt's D-003 list and Q26 do not require a live call here, and making one would change the desk's failure mode.

- Suggest for me writes `Name the concrete change.` into the draft and does not post (`cards.ts` lines 495–500). Hold to talk is part of `renderCard` and this page has no voice handler. Live suggest and voice stay on the interview desk. The buttons are visible because the prompt requires that card.

- Prompt 134 says the cards go "through the server (046)". Prompt 046 is Archetype, positioning, story. The loopback companion server is prompt 034. The implementation follows 134's file list: `packages/app/src/before-jump/cards.ts` plus `renderCard`. It is not mounted on `packages/app/src/server/routes.ts`. Nothing in the app's phase runner calls `onPhaseStart` yet. The function and the page are what this prompt's file list can ship. A later prompt can mount them.

- Prompt 132 still pads a short list to three announcement questions. Prompt 134 forbids that padding. The hook drops those three lines, and the tests require them absent. The generator's own floor is unchanged. That split was already a known issue in review 133. This hook is the layer 134 assigned to the drop.

## Commands

Run from the repo root on `eca6fae`, before this docs commit:

- `pnpm --filter @hitchhiker/engine test` exited 0. 590 tests, 589 pass, 0 fail, 1 skipped. The skip is `live smoke returns a two-field object`, which stays off unless `HH_LIVE=1`. It is the adapter's opt-in smoke from prompt 011, not a test these prompts added.
- `pnpm --filter @hitchhiker/app exec playwright test e2e/before-jump.spec.ts` exited 0. 2 passed.

No prompt in this group defers its test runner to a later prompt.

## Scope

No source change in this session. No fix commit. No push, no remote, no deploy. Prompt 138 is not started.
