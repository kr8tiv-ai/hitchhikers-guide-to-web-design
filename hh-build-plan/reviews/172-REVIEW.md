# 172 Review — prompts 160 to 171

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-10. Fresh session. Two fix commits, then this review. No new feature. Prompt 173 is not started.

Each must-have truth below has a test name and a file line. `pnpm -r test` exited 1. The only failure is the package-boundary scan on the prompt 164 test import. `pnpm exec tsc -b --pretty false` exited 0. A follow-up of the packages the recursive run aborted (app, cli, qa, deploy, orchestrator) exited 0.

## History

Twelve build commits sit on `64631f9` (`docs(plan): queue bug, usability and ship-path prompts 160-173`), in order, one per prompt. The messages match the commit lines. They are not a squash. History was not rewritten. This session does not push.

| Order | Commit | Message | Role |
| --- | --- | --- | --- |
| 1 | `3aae829` | `fix(cli): run the hh bin with type stripping enabled` | prompt 160 |
| 2 | `808b42b` | `docs(readme): fix the quick start for a git clone` | prompt 161 |
| 3 | `393c0e1` | `fix(cli): print the command table for unknown subcommands` | prompt 162 |
| 4 | `c099e21` | `docs: align README, context package, and once-over report with the code` | prompt 163 |
| 5 | `3ec7131` | `feat(driver): add a node runner for macOS and Linux` | prompt 164 |
| 6 | `afdef15` | `feat(app): show doctor preflight on first run and fix the empty brand plate` | prompt 165 |
| 7 | `ab246fb` | `feat(app): add the settings route and the xAI STT quote gate` | prompt 166 |
| 8 | `4d784e8` | `feat(app): clearer question card with counts, key hints, and assumed marks` | prompt 167 |
| 9 | `4917a7f` | `feat(app): linked map, next-action footer, and trimmed transcript` | prompt 168 |
| 10 | `9a248bc` | `feat(app): one next action on every empty plate` | prompt 169 |
| 11 | `4653c80` | `feat(app): focus management, live region, and visible focus ring` | prompt 170 |
| 12 | `fe18541` | `feat(app): logo drop zone and opt-in German restatement` | prompt 171 |

One extra commit sits between 168 and 169: `d305647` `docs(plan): queue prompt 174 to fix CI regressions`. It only adds `hh-build-plan/INDEX.md` and `hh-build-plan/prompts/174-fix-ci-regressions.md`. It is a later plan, not a 160–171 feature. It was not reverted and was not started.

HEAD at review start was `fe18541`. Two fix commits follow, each named for checkpoint 172:

| Order | Commit | Message |
| --- | --- | --- |
| 13 | `2f56a13` | `fix(review): checkpoint 172 shows the guide map rail from 720px` |
| 14 | `db4ba40` | `fix(review): checkpoint 172 reads switch cases as cli subcommands` |

## File lists

From `64631f9` to `fe18541`, plus the extra plan commit. Extras stay because the tests need them. Nothing was reverted.

- 160: `packages/cli/src/main.ts`, `packages/cli/test/shebang.test.ts`. The prompt also named `README.md` and `packages/cli/package.json`. Those stayed put. The shebang truth is met without raising `engines.node`.
- 161: `README.md`, `packages/qa/test/readme-quickstart.test.ts`. Matches the list.
- 162: the three named files, plus assertion updates in `packages/app/test/server.test.ts`, `packages/cli/test/assets.test.ts`, `packages/cli/test/doctor.test.ts`, and `packages/cli/test/progress.test.ts`. The new stderr table changed those expectations.
- 163: `README.md`, root `CONTEXT-PACKAGE.md`, `hh-build-plan/once-over/004-credits-json-shapes.md`, `005-sharp-lgpl-and.md`, `REPORT.md`, `packages/qa/test/docs-truth.test.ts`. The prompt named `hh-build-plan/CONTEXT-PACKAGE.md`. The live sentence the test reads is in the root file.
- 164: `.hh-driver/run-build.mjs`, `.hh-driver/README.md`, `packages/qa/test/driver-runner.test.ts`. Matches the list. `.hh-driver/run-build.ps1` is byte-identical from `3ec7131^` to `3ec7131`, and from `64631f9` to `fe18541` (`git diff --exit-code` exit 0 both times).
- 165: named cli, routes, card, and app tests, plus `packages/app/src/server/server.ts` which passes the preflight into the desk.
- 166: matches the list (`routes.ts`, `settings.ts`, `settings.test.ts`, `packages/voice/src/xai-stt.ts`).
- 167: named files, plus `packages/app/src/card.ts` and `packages/app/src/card.css` for the composer.
- 168: matches the list.
- 169: named files, plus `packages/app/src/client/drive.ts` and `packages/app/src/drive-markup.ts`.
- 170: named files, including `packages/app/src/design/` (`tokens.css`, `tokens.ts`, `components.css`, `design/README.md`).
- 171: matches the list.

## Fixes

### 168. The wide map rail painted at height 0

Chromium hides a closed `<details>` body with `content-visibility: hidden` on `::details-content`. `display: grid` on `.hh-map` did not paint the list. At 1440 the nav and the list measured height 0 while the links were in the DOM. `2f56a13` adds `.hh-map-fold::details-content { content-visibility: visible; }` inside `@media (min-width: 720px)` (`packages/app/src/server/routes.ts`, `MAP_FOLD_CSS`). The `<details>` stays closed. The narrow query still hides the list.

After the restart, at 1440 the map height was 641px, the summary was `display: none`, and the details element was closed. At 375 the summary was `display: list-item`, the map height was 0, and the page did not overflow. Test `map phases link to desks and exactly one is the current step` (`packages/app/test/map-footer-transcript.test.ts` line 82) requires both the visible rule and `display: grid`.

### 162. The plugin command parser missed the switch

`packages/grok-plugin/src/commands.ts` compared `COMMANDS` with names found by a regex on equality checks in `main.ts`. Prompt 162 moved dispatch to `case` labels. The regex then saw seven names. `COMMANDS` still listed the ten implemented commands. `db4ba40` extends the regex to `case "name":`. The `COMMANDS` array is unchanged. Test `COMMANDS matches the hh CLI subcommands` (`packages/grok-plugin/test/commands.test.ts` line 241) passes.

## 160 Run the hh bin with type stripping enabled

### Truths

- Line 1 of `packages/cli/src/main.ts` is `#!/usr/bin/env -S node --experimental-strip-types`. Already fixed. Test `the hh shebang enables type stripping` (`packages/cli/test/shebang.test.ts` line 11).
- A test fails if the shebang loses the flag. Same test.
- A test fails if the CLI entry graph uses non-erasable TypeScript. Test `the cli entry graph has no non-erasable typescript` (line 17).
- Command behavior of the shebang change is the type-stripping entry. Prompt 162 owns the unknown-command branch after that.

### Key link

README Node range versus `package.json` `engines.node` (`>=22`) is recorded under known issues. Prompt 161 locks the quick start at `Node >=22.18`. The shebang truth holds without raising the engines floor.

## 161 Fix the quick start for a git clone

### Truths

- The quick start is a clone path: Node >=22.18, `corepack enable`, `corepack prepare pnpm@10.32.1 --activate`, `pnpm install`, `pnpm exec hh doctor`, `pnpm exec hh app --project <dir> --no-open`. Already fixed. Test `README quick start is a git clone, not an npm package` (`packages/qa/test/readme-quickstart.test.ts` line 61).
- `npx hitchhikers-guide` is one future note: the name is not on npm and returns 404 today. Same test.

## 162 Print the real command table for unknown subcommands

### Truths

- `hh drive` and `hh dont-panic` exit 2. Already fixed. Test `hh drive and hh dont-panic exit 2 with the command table` (`packages/cli/test/unknown-command.test.ts` line 37).
- The output lists the ten implemented commands and the skill-only slash commands. `IMPLEMENTED_COMMANDS` (`packages/cli/src/commands-table.ts` line 11) is install, app, assets, tools, mostly-harmless, elevate, progress, pause, resume, doctor. Test `the table lists every skill-only slash command from the plugin` (line 58).
- Doctor does not run on an unknown subcommand. The line 37 test covers the table and the exit. Test `hh doctor still runs and hh --help stays the usage line` (line 130).
- Known commands behave as before. Same doctor and help test.

### Key link

Implemented names match the dispatch switch. Test `implemented names are the dispatch cases in main.ts` (line 118). The plugin-side parser is the second fix above.

## 163 Align README, context package, and the once-over report

### Truths

- README Develop names the root test script and the engine filter. Already fixed. Test `README Develop names the root test script and the engine filter` (`packages/qa/test/docs-truth.test.ts` line 37). Develop is README lines 72–74.
- CONTEXT-PACKAGE defers GSAP to D-001 and drops the live fallback advice. Test `CONTEXT-PACKAGE defers GSAP to D-001 and keeps no live fallback advice` (line 47). It reads the root `CONTEXT-PACKAGE.md`.
- The once-over report does not leave an applied fix open. Test `the once-over report does not leave an applied fix open` (line 58). Fixes 1–10 are marked applied or closed with evidence. The report's note that fix 009 added no desk route was true at `c099e21`. Prompt 166 later added `/settings`. The historical report stays.

## 164 Add a node runner for macOS and Linux

### Truths

- Pure helpers match the PowerShell behavior on real prompt files. Already fixed. Test `front matter matches the PowerShell regexes for 157, 158, and 159` (`packages/qa/test/driver-runner.test.ts` line 156). Test `shouldPush is true only for checkpoint and once-over` (line 225). Test `resume starts at last_done + 1` (line 244) includes `resumeFrom(0, "163") === 164`.
- README names both runners. Test `the README names both runners and when to use each` (line 371). `.hh-driver/README.md` says use `run-build.ps1` on Windows and `run-build.mjs` on macOS and Linux.
- `run-build.ps1` behavior is unchanged. `git diff --exit-code 3ec7131^ 3ec7131 -- .hh-driver/run-build.ps1` exited 0.

### Key link

`shouldPush` (`run-build.mjs` line 196) is true only for checkpoint and once-over. The script also calls `pushMain` when the queue finishes (line 1058), matching `Push-Main 'final'` in `run-build.ps1` line 231.

`isLiveDriverPid` (line 505) treats `node`, `powershell`, and `pwsh` as live. The PowerShell lock (line 185) still matches only `powershell|pwsh`. That split is a known issue. This review does not edit `run-build.ps1`.

`--always-approve` on both runners is the existing Grok Build tool-approval flag. It is not the brief, prompt, Elevate, or Hostinger gate.

## 165 Show doctor preflight on first run and fix the empty brand plate

### Truths

- A first run lists grok, playwright, whisper, and pdftotext. Already fixed. Test `a first run with grok missing lists the four probes and does not say Ready` (`packages/app/test/preflight-desk.test.ts` line 57). Test `a first run with every probe present says Ready and lists the four results` (line 77). Test `grok present and the other tools missing still says Ready` (line 92).
- The desk and `hh doctor` share `probePathTools`. Test `the desk and hh doctor share probePathTools` (line 111). `hh app` passes that preflight (`packages/cli/src/commands/app.ts`).
- The empty brand plate names the next action. `EMPTY_BRAND_ACTION` is `Approve the brief to print the kit` (`packages/app/src/server/card.ts` line 24). The served `/brand` page showed that primary link to `/?question=DP-0.1`, the ghost `Open question DP-0.1`, and the footer `The kit waits on the brief.` The string `The kit is not printed yet` is absent from served HTML. Test `each empty plate has one primary action and the brand plate keeps its question link` (`packages/app/test/empty-plates.test.ts` line 65) also rejects that old string.

## 166 Add the settings route and the xAI STT quote gate

### Truths

- `GET /settings` shows voice, model, effort, and both rates, with xAI off. Already fixed. Test `GET /settings shows voice, model, effort, and both rates, with xAI off` (`packages/app/test/settings.test.ts` line 114). Rates come from `rateCard()`, not a retyped card. Test `settings reads the voice rate card and does not retype it` (line 99). `packages/voice/src/xai-stt.ts` is REST `$0.10` per hour and streaming `$0.20` per hour.
- The desk menu holds Settings. The route nav stays six items: `/`, `/brand`, `/approve`, `/gallery`, `/motion`, `/hh-dashboard`. Test `the desk menu holds settings and the route nav stays at six items` (line 151).
- xAI speech-to-text is refused until the quote is accepted. Test `xAI speech-to-text is refused until the quote is accepted, then it saves` (line 174). A post without acceptance is 409 and voice stays local. Acceptance stores the voice-package rates.

Live `/settings` at 1440: Local checked, xAI unchecked, both rates, `I accept these rates` unchecked, model `grok-4.7`, Medium / High / Extra high, footer `xAI speech-to-text is off.` Settings sits in the Desk menu. The same plate at 375 had no horizontal overflow.

## 167 Clearer question card

### Truths

- The ask is shown once, with the open-required count, and the brief gate stays open when a required answer is skipped. Already fixed. Test `rendered card shows the ask once, the counts, one filled Answer, and the assumption` (`packages/app/test/card-usability.test.ts` line 252). Test `open required uses the same answers as coverage and does not close the brief gate` (line 194).
- Enter sends. Shift+Enter and an open composition do not. Test `Enter submits, Shift+Enter and an open composition do not` (line 570). The hint is `Enter sends the answer. Shift+Enter adds a line.`
- Skip confirms a required field. Test `Skip confirms a required field and posts on the second choice` (line 630). Suggest and Skip keep their labels.
- A skip marks the assumption and shrinks the mast. Test `skip marks the assumption on the next card and shrinks the mast` (line 356).
- The composer sticks under 720px and stays in flow at 1440. Test `composer sticks under 720px and stays in flow at 1440` (line 299). The rule is in `card.css`. No raw hex and no `!important` in that rule.

The first desk screen also shows `Start the interview` in the mast. That button is prompt 169. The question region still has one filled Answer button.

## 168 Linked map, next-action footer, and trimmed transcript

### Truths

- Map phases link to existing desks and exactly one is the current step. Fixed now, as above. Test at `map-footer-transcript.test.ts` line 82. Phase hrefs (`routes.ts` `PHASE_HREF` line 1199): Don't Panic `/`, Babel Fish `/brand`, Deep Thought `/approve`, and Improbability Drive, Mostly Harmless, and So Long share `/hh-dashboard`.
- The footer is the next action once an answer is saved. Test `the footer is the next action once an answer is saved` (line 126). `savedFooterLine` shapes `Saved · ${id} · ${n} left`.
- Five turns show the last three, with Edit on earlier answers. Test `five turns show the last three and Edit on every previous answer` (line 148).
- Edit reuses `/api/answer`. Test `Edit reuses /api/answer and replaces the stored text` (line 185). Test `the Edit control posts the revised text to /api/answer` (line 284).

## 169 One next action on every empty plate

### Truths

- Each empty plate has one primary action. Already fixed. Test `each empty plate has one primary action and the brand plate keeps its question link` (`packages/app/test/empty-plates.test.ts` line 65). Brand primary href is `/?question=DP-0.1`. Approve primary is `Answer the open question`.
- An empty Drive says `No queue yet. The plan lands here after you approve the prompts.` and its primary goes to `/approve`. Same test. `DRIVE_EMPTY_COPY` is that sentence.
- A queue on disk enables the four gates as links to `/approve` and still omits the xAI disclaimer. Test `a queue on disk enables the four gates and still omits the disclaimer` (line 92). The gates do not deploy from the empty plate.
- A fresh desk shows Start the interview on the first question. Test `a fresh desk shows Start the interview on the first question route` (line 115).

Live empty Drive at 1440: Pause, Approve, Elevate, and Deploy were disabled, Approve / Elevate / Deploy href `/approve`, the note says they open the approval gate and this page does not open a model session, and the primary is `Approve the prompts`.

## 170 Focus, live region, and visible focus ring

### Truths

- Submit focuses the new question. Already fixed. Test `submit focuses the new question heading and updates the same live region` (`packages/app/test/desk-a11y.test.ts` line 131).
- The question is in a polite live region. The desk injects `<p class="hh-guide-live" data-guide-live aria-live="polite">` (`packages/app/src/server/routes.ts` line 1323). Test `the desk page announces the question and keeps the mic off the action row` (line 80).
- A failed save keeps the draft and uses `The answer did not save. Try again, or skip.` Test `a failed save keeps the draft under the field and does not move focus` (line 108).
- Focus color is separate from the rust accent. Test `focus is ink and light cream, and the ring token is on the button and the field` (line 28). `--color-focus-light` is `#1c1612` and `--color-accent-light` is `#8e2f1a` (`packages/app/src/design/tokens.css` lines 10 and 20).
- A missing speech API disables the mic with `Talk needs Chrome or Edge`. Test `a missing speech API disables the mic with the Chrome or Edge line` (line 166). This session's Chromium has the speech API, so the live button read `Hold to talk` and was enabled. That matches the browser.

## 171 Logo drop zone and opt-in German restatement

### Truths

- Logo questions are DP-0.4 and DP-1.1. Already fixed. Test `logo questions are DP-0.4 and DP-1.1, and the German line stays out of the card` (`packages/app/test/logo-drop.test.ts` line 147). The German restatement is for DP-1.1. The toggle `Read this in…` stays closed until opened.
- A logo file stays in the project and the brand plate reads it. Test `a logo file stays in the project and the brand plate reads it` (line 274). PNG is stored under `.hitchhiker/uploads` and recorded in `.hitchhiker/brand/logo-intake.json`.
- The wrong type and an oversize body do not become the logo. Test `other questions, the wrong type, and an oversize body do not become the logo` (line 340).
- The desk posts a logo file and reveals German only after the toggle opens. Test `the desk posts a logo file and reveals German only after the toggle opens` (line 395).

This session did not reopen a logo question in the browser. The 375 overlap of the sticky composer and the drop zone is the note already in the 171 commit. The unit tests encode the ids, the upload rules, and the closed toggle.

## Approval gates

`git diff --stat 64631f9 HEAD -- packages/deploy packages/engine/src packages/orchestrator/src` at the 171 commit, and again after the two fix commits, is empty for those trees before the review docs. Hostinger still throws without approval (`packages/deploy` tests include `approved false throws, does not upload, and does not claim success`, which passed in the follow-up). Drive gates on an empty queue are disabled and point at `/approve`. Skipping a required answer does not close the brief gate (prompt 167, test line 194). Elevate and Hostinger yes were not edited.

## UI

Looked at in Playwright against `http://127.0.0.1:4188/` (project under the temp review dir). Compared with Desk Lamp tokens: surface `#f3ebdd` measured `rgb(243, 235, 221)`, ink and focus `#1c1612`, rust accent `#8e2f1a`. The Don't Panic wordmark (`hh-wordmark`, accessible name Don't Panic) is on every route checked. No purple-to-blue gradient, no magnetic button, no default indigo.

Measured at 375 and 1440 for `/`, `/brand`, `/approve`, `/hh-dashboard`, `/settings`, `/gallery`, and `/motion`: scroll width did not exceed the viewport, body text had zero exclamation marks, and the wordmark was present. Served HTML for those seven routes had zero `!` after the doctype, no `The kit is not printed yet`, and no `not xAI` disclaimer.

Screenshots looked at: `.playwright-mcp/172-desk-1440-fixed.png` (map rail, rust underline on Don't Panic), `.playwright-mcp/172-desk-375.png` (compact map `Don't Panic · 1/63`, sticky composer, six routes), `.playwright-mcp/172-brand-1440-review.png`, `.playwright-mcp/172-drive-1440-review.png`, `.playwright-mcp/172-settings-375.png`. Those files are local evidence and are not part of the commit.

The design comp `packages/app/src/design/comps/dashboard.html` line 20 still says `not xAI's agent dashboard`. The served `/hh-dashboard` does not. The comp is outside the 169 file list. Left as a known leftover.

## Commands

Run from the repo root after the two fix commits:

- `pnpm -r test` exited 1. Scope: 12 of 13 workspace projects. Completed with 0 fail before the abort: crawler, knowledge, voice, grok-plugin. Engine failed one test and pnpm stopped the recursive run (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`).
- Failure: `the repo has no deep imports and no package escapes` (`packages/engine/test/boundaries.test.ts` line 90). `findEscapes` reports `packages/qa/test/driver-runner.test.ts` importing `../../../.hh-driver/run-build.mjs`. That import arrived in prompt 164. The boundary test expects an empty list. Weakening that assertion is out. Moving the runner into a workspace package would be a new surface. Left as ESCALATE in known issues.
- Follow-up `pnpm --filter @hitchhiker/app --filter hitchhikers-guide --filter @hitchhiker/qa --filter @hitchhiker/deploy --filter @hitchhiker/orchestrator test` exited 0. Each package reported fail 0. QA reported 242 pass. Assets and templates, also aborted by the recursive run, exited 0 in a second follow-up (assets 122 pass, 1 skipped; templates 37 pass).
- `pnpm exec tsc -b --pretty false` exited 0.
- `Test-Path hh-build-plan/reviews/172-REVIEW.md` returned True.

Targeted checks before the full run: `packages/app/test/map-footer-transcript.test.ts` 5 pass, exit 0. `packages/grok-plugin/test/commands.test.ts` 9 pass, exit 0, including `COMMANDS matches the hh CLI subcommands`.

## Known issues

- Prompt 164's test imports `../../../.hh-driver/run-build.mjs`. `findEscapes` fails the repo scan, so `pnpm -r test` exits 1. A fix that keeps the boundary test and the prompt's file list needs a package for the runner. That is a new surface. ESCALATE. Do not allow the specifier just to green the scan.
- `d305647` queues prompt 174 between 168 and 169. Not part of 160–171. Not started.
- README quick start says `Node >=22.18` (prompt 161, test-locked). Root `engines.node` is `>=22`. Develop says `Node 22`. The 160 shebang satisfies the bin truth. Aligning the three strings fights one of those two prompts.
- `run-build.ps1` line 185 treats only `powershell` and `pwsh` as a live lock. `run-build.mjs` `isLiveDriverPid` also treats `node` as live. The README says a live node pid blocks the other launch. The PowerShell side does not. `run-build.ps1` was left unchanged on purpose.
- `packages/app/src/design/comps/dashboard.html` line 20 still has the xAI agent-dashboard sentence. Served Drive does not.
- If a caller omits `deskPreflight`, `deskStatus` can fall through to `Ready.` Production `hh app` always passes the preflight. The tests cover the passed-in probes.
- The first question shows two rust actions: mast `Start the interview` (169) and card `Answer` (167). Each prompt asked for its own control. Both remain.
- `MAP_FOLD_CSS` is an inline style whose hash is added to the CSP. It uses the design tokens.

## Notes

- No conflict with `context/matt-answers.md` or `DECISIONS.md` was found in these twelve prompts. D-001 still requires GSAP. These commits add no GSAP fallback and do not add `@theatre/studio`.
- Prompt 173 is not started.
- Logo question ids are assumed to be DP-0.4 and DP-1.1, which is what prompt 171 and its test already use.
