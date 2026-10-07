# 095 Review — prompts 092, 093, 094

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 096 is not started. This review closes Deep Thought.

The must-have truths for 092, 093, and 094 hold. Each one below has a test name and a file line. The verdict is not a clean PASS because two checks that these commits do not own still exit 1: the engine boundaries test (already recorded in 091) and `pnpm exec tsc -b --pretty false` (one pre-existing diagnostic in `packages/assets`). The site and the Guide app still start. Neither failure is a Deep Thought success criterion.

## History

Three build commits, in order, on top of `0165d65` (the 091 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `42c8ddb` | `0165d65` | `feat(spec): golden prompt library and Grok-authored site prompts` | same, prompt 092 |
| 2 | `4ed9ad6` | `42c8ddb` | `feat(spec): gate the drive on an explicit approval` | same, prompt 093 |
| 3 | `2e75670` | `4ed9ad6` | `feat(spec): edit site prompts without dropping gates` | same, prompt 094 |

HEAD is `2e7567024569e42fb9c9af14025389a5e3504820`.

## 092 Golden prompt library and Grok-authored site prompts

### Truths

- Site prompt bodies are written by Grok and gated by the validator. `authorPackage` calls `deps.think` with `AUTHOR_MODEL` (`grok-4.7`), `AUTHOR_EFFORT` (`xhigh`), and `AUTHOR_BODY_SCHEMA` (`packages/engine/src/spec/author.ts` lines 260–266, and the one repair at 273–277). The schema requires a string `body` (`packages/engine/src/spec/author-schemas.ts` lines 11–24). `entryReport` runs `validatePackage` and adds a `read-first-anchor` error when a CONTEXT.md anchor is missing (`author.ts` lines 319–350). A failed entry is not written (`needsHuman`, lines 217–250). Test `framework discussion and authored packages` (`packages/engine/test/author.test.ts` line 432) asserts model, effort, and schema on every call, requires `validatePackage` ok on the calm package, requires one repair, and requires a double failure to leave `001` unwritten. Test `replay returns an authored body and does not spawn` (line 624) calls the real `think()` with `HH_CASSETTE=replay` and a spawn that throws. There is no product path that writes a body without `think`.

- Matt's proven prompts are reused with credit. `packages/knowledge/golden/` holds 42 markdown templates. 36 end with `Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.` Test `about 40 golden templates carry slots, sections, and the denylist` (author.test.ts lines 312–338) requires a count from 40 to 48, the v1 section headings, the must_have keys, the slots, no `act as a`, no `ignore previous`, no em dash, no exclamation mark, under 900 words, and at least 30 credited files. A template that quotes a Matt phrase and omits the credit line fails that test (`quoted || text.includes(CREDIT)` then the last line must be the credit). `nav.md` line 82 is that credit line. D-005 says Matt's wording may be used word for word with credit.

- The user owns the framework choice. `discussFramework` shows the card and returns the user's override (`packages/engine/src/spec/framework-discussion.ts` lines 40–59). `tradeoffs` is the section `What would change this`. Test `a sveltekit override is honored and insisted` (`packages/engine/test/stack.test.ts` line 98) locks `decideStack`. The same author test covers an accept, a SvelteKit override, an inflight stop, a WordPress throw, and a mid-run override that retargets paths to Next (`src/components/Nav.tsx`).

### Also checked

- `compose` sends the golden template under `GOLDEN_TEMPLATE:` (`author.ts` line 435). The token budget is 30_000. Pack excerpts are trimmed before anchors (`AUTHOR_TOKEN_BUDGET` in author-schemas.ts line 16; test `a huge pack excerpt is trimmed before the anchor and the skeleton`).
- The six files without the credit line are `feature.md`, `integrations.md`, `layout.md`, `once-over.md`, `routes.md`, and `seo.md`. They do not contain the Matt phrases the test treats as a quote, so the credit line is not required there.
- CI does not call the live model. The package test injects `bodyFor`. Spot sentences in that test are produced by the double, then asserted in the written files. The golden files are what `compose` would send. That is a test double, not a product stub.
- `CONTEXT-PACKAGE.v2.md` line 396 says golden templates are "Inspired by Matt's method. Not his text." D-005 and prompt 092 require the wording verbatim with credit. Authority is D-005. The implementation followed D-005. This review records the conflict and does not revert the credit.

## 093 Require a yes before Improbability Drive

### Truths

- The drive cannot start without a matching approval file. `assertDriveAllowed` throws when `raw` is null or undefined: `Missing drive approval. A missing file is not a yes.` (`packages/engine/src/spec/approve-drive.ts` lines 107–110). A pass also requires boolean `approved`, a positive `count`, a sha256 of the prompt ids, and a recorded yes plus file sha256 for `prd`, `context`, and `promptPackage` (lines 117–135). It returns void. The module does not import `child_process` and does not start the orchestrator. Test `a missing file is not a yes` (`packages/engine/test/approve-drive.test.ts` line 119). Test `a matching approval is allowed` (line 114). Test `approved false and the string true are denied` (line 133). Test `a stale count is denied and count 0 throws` (line 143). Test `a hash mismatch is denied, including a stale file hash` (line 151). Test `a missing file yes is denied` (line 169) covers each of the three file yeses. Test `the gate module does not spawn a process or call a model` (line 205).

- The UI does not default to yes. `initialApprovalState` is `{ prd: false, context: false, promptPackage: false, drive: "no" }` (`packages/app/src/approval.ts` lines 41–42). `reduceApproval` keeps `drive` at `"no"` when a gate is recorded (line 51) and sets `"yes"` only after all three gates and an `allow` (lines 53–60). The button text is `Approve and allow the drive` and the attribute is `data-approve-drive` (line 116). The render has no `<input>` and no `checked`. Test `three titles render three list items and the drive button stays at no` (`packages/app/test/approval.test.ts` line 29). Test `the reducer keeps the button at no until all three yeses and an allow` (line 81). Test `an empty title list cannot render a yes` (line 115).

### Also checked

- Prompt 093's interface snippet lists `count` and `promptIdsHash`. The goal and Q10 require three file hashes. The implementation requires `prd`, `context`, and `promptPackage`, each `{ approved, at, sha256 }`. The source comment records that extension. This review treats it as the goal, not a defect.
- The screen yes is a data attribute after the reducer. `assertDriveAllowed` is the start gate and still requires the file. The prompt keeps those as two functions. No writer in this prompt persists the JSON. The tests write the file they then read.
- The rendered copy says `Token estimate`. It does not print a dollar price. Titles are escaped (test `titles are escaped and tiers are an attribute plus visible text`).

## 094 Edit a site prompt without losing its must_haves

### Truths

- Prompt edits stay inside the schema. `editSitePrompt` throws when RULES are not the shared string, when must_haves become empty or change, when a second `MotionLib` appears, when the goal is under 80 characters, when the goal contains an exclamation mark or markup, when a named file is missing, and when the id is unknown or duplicated (`packages/engine/src/spec/edit-prompt.ts` lines 90–108, with the checks those lines call). Test `RULES cannot be removed or replaced` (`packages/engine/test/edit-prompt.test.ts` line 282). Test `empty must_haves throws and bullet must_haves keep their length` (line 271). Test `a second motion library in the goal throws` (line 230). Test `reduced-motion does not count as a second library` (line 243). Test `a goal under 80 characters throws and 80 is allowed` (line 176). Test `a goal with an exclamation mark throws` (line 184).

- A stale drive approval cannot survive an edit. The return type is `{ prompts, approvalStillValid: false }` and the function returns that constant on every successful save, including an unchanged goal (`edit-prompt.ts` lines 59–63 and 108). Test `a goal edit keeps rules and must_haves and invalidates approval` (line 125) pins the flag with `const still: false`. Test `saving the same goal still invalidates approval` (line 155). Prompt 094 step 1 says the function is pure and the caller deletes the approval file. The function does not write `.hitchhiker/drive-approval.json`. The flag is what a later writer has to honor (prompt key link). There is no approval writer in 092–094, so this review does not add one.

- Deep Thought ends at an approval gate, not at a running queue. `edit-prompt.ts`, `approve-drive.ts`, and `approval.ts` do not reference `child_process` or `spawn`. Test `the approval screen does not spawn a process or call a model` and test `the gate module does not spawn a process or call a model` read the source. Test `generateSitePrompts stays between 50 and 150 on the small calm site` (edit-prompt.test.ts line 299) aliases `generateSkeleton` and keeps the 3-page calm fixture inside the band. The one-page fixture stays under 50 on purpose, which prompt 090 already locked.

## Deep Thought success criteria

1. TRUE. STACK-DECISION.md records pick, why, alternatives, and what would change the decision, and the user can override it. `render` prints those headings (`packages/engine/src/spec/stack.ts` line 230 for `## What would change this`). `decideStack` honors `userOverride`. Test `a sveltekit override is honored and insisted`. `discussFramework` puts that same section on the card (`framework-discussion.ts` lines 44–52) and applies the override (lines 48–59).

2. TRUE. MOTION.md assigns one library per effect and states the per-page scroll owner, the ticker, and the WebGL context rule. `renderMotionMd` prints `One library owns each effect.`, `One scroll owner per page: lenis+scrolltrigger, native, or none.`, and `One WebGL context per page.` (`packages/engine/src/spec/motion.ts` lines 407 and 455–458). The Lenis row note is `Lenis drives ScrollTrigger on gsap.ticker.` (line 387). Test `a scroll sequence at appetite 5 assigns gsap and lenis` (`packages/engine/test/motion.test.ts` line 92). The starter wires the same ticker: test `wireLenis uses one ticker callback and updates ScrollTrigger on scroll` (`packages/templates/test/templates.test.ts` line 92), which passed in this session.

3. TRUE. The skeleton generator emits 50 to 150 entries from real work units, with a final xhigh once-over, and Grok-authored bodies pass the validator. The 090 tests are still in the engine suite, including `a 3-page calm fixture yields 50 to 150 real entries` and `a one-page site stays under 50 and warns instead of padding`. `authorPackage` is the body writer, gated by `validatePackage` (092, above). The once-over entry stays `xhigh`. CI uses the injected `think` plus one cassette replay through the real adapter. The live model is not called in this review.

4. TRUE. Site starters build with the D-001 toolkit, and the blank templates scored Lighthouse mobile at least 90 in all four categories. Prompts 092–094 do not change `packages/templates`. This session's templates run passed `each starter builds and the blank bundle omits unused libraries` (36 pass, 0 fail). The phone scores are the three mobile runs recorded in `hh-build-plan/reviews/087-REVIEW.md`: astro 100/100/100/100 on all three runs; next 99/100/100/100, 99/100/100/100, and 91/100/100/100 (median performance 99); vite 100/100/100/100 on all three. This review did not re-run Lighthouse. There is still no committed score test. That is the known issue from 087, and the recorded measurement still meets D-006.

5. TRUE. The motion toolkit has a knowledge pack at `packages/knowledge/packs/motion/SKILL.md` and `recipes.md` (prompt 080). Integrations are the recipes under `packages/templates/recipes/` (prompt 086, whose own truth is that they are real recipes). 3D sourcing is `packages/assets/src/three-d/` (prompt 085: CC0 and CC-BY sources, Tripo and Meshy behind the dollar cap). Those three homes are the ones the owning prompts named. They are not all directories under `packages/knowledge/packs/`. Adding new pack directories would be a new feature. This review does not add them.

6. TRUE. The approval screen requires three yeses before Improbability Drive. The reducer and `assertDriveAllowed` both require PRD, CONTEXT, and the prompt package (093, above). Neither starts a queue.

The phase goal is the generators, not a checked-in client project. `decideStack` writes the stack record, `renderMotionMd` writes MOTION.md, the PRD writer is prompt 069, `assembleContext` is prompt 089, and `authorPackage` writes the bodies after the 090 skeleton.

## Known issues

- `pnpm --filter @hitchhiker/engine test` exits 1. The only failure is `package.json dependencies match BOUNDARIES` (`packages/engine/test/boundaries.test.ts` line 95, assertion at line 116). `@hitchhiker/assets` depends on `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`, and `meshoptimizer`. `BOUNDARIES.allowExternal` for that package does not list them. Prompt 085 added the packages. Prompts 092, 093, and 094 do not change `boundaries.ts` or `packages/assets/package.json`. Review 091 already recorded this. Auto-fix for this checkpoint stays inside the 092–094 file lists, so this review does not edit the allow list. The app does not fail to start because of it. The skipped engine test is `live smoke returns a two-field object`, which stays off unless `HH_LIVE=1`.

- `pnpm exec tsc -b --pretty false` exits 1. The only diagnostic is `packages/assets/src/three-d/generate.ts(143,33): error TS2379`. `quoteGeneration({ ...req, prompt: prompt ?? undefined, image: image ?? undefined })` fails `exactOptionalPropertyTypes` because `GenerateRequest.prompt` and `image` are optional `string`, not `string | undefined`. Blame for that line is commit `a3e5bbd` (prompt 085). Prompts 092–094 do not touch the file. Review 044 left an out-of-list type error recorded. Review 064 fixed `tsc` only when the defect belonged to the prompts under review. Assets tests still pass (122 pass, 1 skip). This review does not patch `generate.ts`.

- Phone Lighthouse has no committed regression test. Criterion 4 stays TRUE on the 087 measurement. A later edit can drop a score under 90 without a unit test failing.

- The author package test scripts `think` through `bodyFor`. Spot sentences are therefore circular relative to that double. The cassette replay is the check that the real adapter returns a body and does not spawn. No Towel and Tea cassette set is committed. The cassette README says not to commit one. The golden templates are the Matt wording the request would send.

- `editSitePrompt` does not delete `.hitchhiker/drive-approval.json`. Prompt 094 step 1 assigns that delete to the caller. The constant `approvalStillValid: false` is the contract. No approval-file writer exists in these three prompts.

- The approval HTML has no click handler. The reducer is pure, and the caller re-renders. A click on the static page leaves `data-approve-drive` at `no`. That matches the prompt: HTML plus a reducer, not a mounted controller.

- `CONTEXT-PACKAGE.v2.md` line 396 ("Not his text") disagrees with D-005. The golden library followed D-005. Left as recorded, not reverted.

## File list

From `0165d65` through `2e75670`: 54 files, 6557 insertions. They match the three prompt file lists.

- 092: `packages/knowledge/golden/*.md` (39 new templates, plus additions to `page.md`, `motion.md`, and `qa.md`), `packages/engine/src/spec/author.ts`, `packages/engine/src/spec/author-schemas.ts`, `packages/engine/src/spec/framework-discussion.ts`, `packages/engine/test/author.test.ts`, `packages/engine/test/cassettes/author/README.md`, `evals/towel-and-tea/site-prompts/README.md`
- 093: `packages/app/src/approval.ts`, `packages/app/test/approval.test.ts`, `packages/engine/src/spec/approve-drive.ts`, `packages/engine/test/approve-drive.test.ts`
- 094: `packages/engine/src/spec/edit-prompt.ts`, `packages/engine/test/edit-prompt.test.ts`

No file outside those lists. No new package category. No library swap. No `@theatre/studio`.

## UI at 375 and 1440

092 and 094 do not change `packages/app/`. 093 adds `packages/app/src/approval.ts`.

This session rendered `renderApproval` against `packages/app/src/design/tokens.css`, `type.css`, `components.css`, and `shell.css`, and looked at the page in Playwright.

- 1440, default state. Paper ground, rust spine, Don't Panic wordmark, kicker `DEEP THOUGHT` / `APPROVAL GATE`. PRD title `Towel and Tea`. Token estimate `18420` with the sentence that the figure counts context tokens. Three gates read `Waiting` for PRD.md, CONTEXT.md, and the prompt package. The primary button reads `Approve and allow the drive` and uses the rust accent. Eight prompt rows show title and tier. The footer reads `DRIVE PARKED`. No checkbox, no indigo utility palette, no purple gradient, no lorem, no exclamation mark, and the word elevate does not appear.
- 375, default state. The same document stacks. The record buttons wrap inside the column. `scrollWidth` equalled `clientWidth` (375). No horizontal overflow.
- Allowed state, after the reducer recorded all three gates and `allow`. Each gate reads `Yes recorded`. `data-approve-drive` is `yes`. The approve button's computed background is `rgb(142, 47, 26)` and its text is `rgb(251, 246, 238)`, which is the Desk Lamp accent and cream from `tokens.css`. Gate text is ink `rgb(28, 22, 18)`.
- A click on the default page's approve button does not flip the attribute. It stays `no`. The static document has no script. The reducer is what changes the flag, and only after three yeses plus allow.

The only console error was a missing `favicon.ico`. That is not a design defect. No visual fix.

## Live model calls

092 is the live-Grok feature in this group. The call goes through the injected 011 `think` (`packages/engine/src/ai/`) with `AUTHOR_BODY_SCHEMA`, model `grok-4.7`, and effort `xhigh`. The cassette test replays through the real `think()` and asserts that spawn throws. 093 and 094 do not call a model. Their tests assert the source does not spawn. This review did not set `HH_LIVE=1`.

## Verification

`Test-Path hh-build-plan/reviews/095-REVIEW.md` is true once this file is written.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @hitchhiker/knowledge test` | 0 | 40 pass, 0 fail. 345 ms. Includes `loadGolden reads the three templates and the denylist is clean`. |
| `pnpm --filter @hitchhiker/engine test` | 1 | 518 tests, 516 pass, 1 fail, 1 skipped. 6446 ms. The fail is `package.json dependencies match BOUNDARIES`, above. Author, approve-drive, and edit-prompt tests passed in that run, including `framework discussion and authored packages`, `replay returns an authored body and does not spawn`, `a missing file is not a yes`, and `a goal edit keeps rules and must_haves and invalidates approval`. |
| `pnpm --filter @hitchhiker/app test` | 0 | 87 pass, 0 fail. 1822 ms. Includes all 7 approval tests. |
| `pnpm -r test` | 1 | `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` on `@hitchhiker/engine` for the same boundaries failure. Completed before the stop: grok-plugin (`process.exit(0)`), knowledge (40 pass), crawler (80 pass), voice (43 pass). Not started by that command: app, assets, templates, orchestrator, deploy, qa, and the CLI package. |
| Continuation of the packages `pnpm -r` did not reach | 0 | assets 122 pass, 1 skip (Imagine live smoke); templates 36 pass, 0 fail, including the starter build; orchestrator 13 pass; deploy and qa are `process.exit(0)`. The filter `@hitchhiker/cli` matched nothing. The package name is `hitchhikers-guide`. |
| `pnpm --filter hitchhikers-guide test` | 0 | 32 pass, 0 fail. 410 ms. Run because `pnpm -r` stopped before it. |
| `pnpm exec tsc -b --pretty false` | 1 | One diagnostic, TS2379 at `packages/assets/src/three-d/generate.ts:143`, above. |

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 096 is not started.
