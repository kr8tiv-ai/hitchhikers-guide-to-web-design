# 079 Review — prompts 076, 077, 078

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. This checkpoint closes the pack checker, the three golden templates, and the anti-slop, brand, and copy packs. Prompt 080 is not started.

The must-have truths for 076, 077, and 078 hold. Each one below has a test name and a file line. `pnpm --filter @hitchhiker/knowledge test`: 24 pass, 0 fail. `node --experimental-strip-types --test packages/engine/test/golden.test.ts`: 5 pass, 0 fail. The engine file is extra evidence for 077. The knowledge tests are the ones that call the checkers.

## History

Three build commits, in order, on top of `f433f7f` (the 075 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `1b7d9f8` | `f433f7f` | `feat(knowledge): validate pack frontmatter and sources` | same, prompt 076 |
| 2 | `9d41c13` | `1b7d9f8` | `feat(knowledge): add original golden prompt templates` | same, prompt 077 |
| 3 | `1a554e7` | `9d41c13` | `feat(knowledge): add anti-slop, brand, and copy packs` | same, prompt 078 |

## 076 Define the knowledge pack format

### Truths

- Pack format matches v2 section 17. Frontmatter keys are `description`, `when-to-use`, and a `paths` list (`packages/knowledge/src/pack.ts` lines 7–11 and 32–49). `paths` as one string throws (lines 45–47). A missing closing `---` throws (lines 28–30). `lintPackClaims` warns when a line contains `%` or a year from 1900 through 2099 and the next non-empty line does not start with `Source:` (lines 52–64 and 145–147). v2 section 17 asks for a source on every non-obvious claim. Prompt 076 step 3 narrows that check to a percent or a four-digit year, and the tests lock that rule. The example pack describes the checker and states no external statistic (`packages/knowledge/packs/example/SKILL.md` lines 10–14). Test `the example pack loads and passes the claim linter` reads that file and expects the three fields plus an empty warning list. Test `a percent without Source fails`. Test `a four-digit year used as a statistic needs a source`. Test `missing description throws`. Test `paths as a single string throws`. Test `an empty body passes the claim linter`.

- Effort is not a skill frontmatter field. `readFrontmatter` throws `Set effort on the prompt, not the skill.` when the key is `effort` (`pack.ts` lines 96–98). The example pack has no `effort` key. Test `effort in frontmatter throws` requires that message. Test `a description may mention effort without setting the key` allows the word inside `description`. Test `the example pack loads and passes the claim linter` asserts no `effort:` line in the fixture.

### Also checked

- The parser is a small subset. No yaml package was added. A flow list and CRLF frontmatter parse. Test `a flow list is accepted and CRLF frontmatter parses`.
- A percent or a year followed by `Source:` passes. Test `a percent followed by Source passes` and the year test's second assertion.
- Files outside the frontmatter list are the ones the prompt body requires: `packages/knowledge/packs/example/SKILL.md` (context and artifacts), `packages/knowledge/package.json` (step 6 replaces the `process.exit(0)` stub with the test script), and a re-export in `packages/knowledge/src/index.ts` (step 6). The commit names those files.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 077 Add golden site prompts from Matt's method, with credit

### Truths

- Golden prompts credit Matt's AntiHero guides wherever his wording is used. Each file ends with `Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.` (`packages/knowledge/golden/page.md` line 55, `motion.md` line 58, `qa.md` line 53). `GOLDEN_CREDIT` is that sentence (`packages/knowledge/src/golden.ts` lines 17–18). `lintGolden` requires it as the last non-empty line (lines 102–108). The quoted lines are Matt's, kept as written in `context/sources/prompts.txt`: the section task ("Add one section with real copy and layout. Motion comes later." and "No effects yet; motion comes in a later prompt.", prompts.txt lines 449 and 470), the motion feel line ("Motion must feel confident and quick but never bouncy", prompts.txt line 383), the reduced-motion and stagger lines (prompts.txt lines 500 and 655), and the QA task ("Open every page in a real browser and catch what broke." and the Playwright paragraph, prompts.txt lines 610 and 613). `MATT_MARKERS` lists those strings (`golden.ts` lines 37–48). Test `a Matt quote without the credit line fails` strips the credit from `page.md` and expects `quotes Matt without the credit line`. Test `loadGolden reads the three templates and the denylist is clean` expects `lintGolden` to return no problems, which includes the credit and the Matt lines.

- They still carry the Guide's rules by reference. Each template names `packages/engine/src/spec/site-rules.ts` and says not to paste that file (`page.md` line 12, `motion.md` line 12, `qa.md` line 10). `lintGolden` pushes `missing site-rules.ts` when the path is absent (`golden.ts` line 91). Test `RULES are referenced by path, and dropping the reference fails` requires the path, rejects a pasted `TypeScript strict. No \`any\`` block, and expects the lint failure after the path is replaced. `site-rules.ts` is created in prompt 090. This prompt says to reference the path and not invent the module. That absence is the instruction, recorded in the 077 commit.

### Also checked

- Motion slots are `{{library}}` and `{{element}}` (`motion.md` lines 3–5 and 18). The allowed names are the nine `MotionLib` ids from `packages/engine/src/spec/motion.ts` lines 22–31, repeated in `MOTION_LIB_NAMES` (`golden.ts` lines 21–31) and in the template as backticked ids. Test `a missing motion token fails` and test `a missing element token fails`.
- The QA template contains `375`, `1440`, `real mobile`, `Lighthouse mobile 90`, `axe`, and `zero console errors` (`qa.md` lines 3, 16, and 18). `lintGolden` requires those strings for `qa` (`golden.ts` lines 133–139). D-006 is the phone gate. The "median of three runs" phrase in `qa.md` line 39 matches v2 section 12.
- Headings are Goal, Files, Steps, must_haves, and Verify. must_haves include `truths:`, `artifacts:`, `key_links:`, and `prohibitions:`. Word count at or above 900 fails (`golden.ts` line 90). Test `a template of 900 words fails`.
- Slop starters `act as a` and `Ignore previous`, an em dash, and an exclamation mark fail. Test `slop starters, an em dash, and an exclamation mark fail`.
- v2 section 10.5 says the templates are inspired by Matt's method and are not his text. D-005 and prompt 077 allow his wording word for word with credit. Authority is D-005. The 077 commit records the conflict and quotes him with the credit line. This review keeps that reading.
- `loadGolden` lives in `packages/knowledge/src/golden.ts` (prompt step 8). `packages/knowledge/test/golden.test.ts` line 14 says the generator may quote the templates later. `packages/knowledge/src/index.ts` re-exports `loadGolden`. `packages/engine/test/golden.test.ts` repeats the denylist because the engine package does not import knowledge. Its happy-path test `three golden templates exist and pass the denylist` asserts the files. Its four negative tests throw from an `if` written inside the test, so they are not the evidence for these truths. The knowledge tests call `lintGolden`.
- `generateSitePrompts` is not called from these files. Prompt 092 expands the library.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 078 Write the anti-slop, brand, and copy packs

### Truths

- The ban list is data the linter can share later. `packages/knowledge/packs/anti-slop/SKILL.md` lines 39–99 hold three fences, `patterns`, `words`, and `phrases`. `fence` in `packages/knowledge/test/core-packs.test.ts` lines 73–80 reads those fences as line lists. The pattern fence includes `purple-to-blue gradient`, `three identical icon cards`, `lorem`, `invented testimonials`, `default Tailwind indigo look`, `magnetic buttons`, `em dash`, and `exclamation mark`. The word fence equals `BANNED_WORDS` in `packages/engine/src/brand/voice.ts` lines 39–56. The phrase fence equals `BANNED_PHRASES` (voice.ts lines 58–62). Test `anti-slop names the bans and refuses Elevate in a hero` requires that equality and the pattern lines. Elevate is in the word fence, and the prose limits the exception: banned in generated site body copy, including the hero; allowed as the product name in the Guide's own docs, as `/hh-elevate`, and in Guide app chrome headings (`SKILL.md` lines 25–27). The chrome-heading clause follows CRITIQUE C7 and IMP-15. The same test requires `magnetic`, `Elevate`, `/hh-elevate`, `banned in generated site body copy, including the hero`, and `not permission to use the word in a hero`. Test `three core packs parse and make no claim errors` runs `parsePack` and `lintPackClaims` on each file.

- Brand advice does not invent proof. `packages/knowledge/packs/brand-frameworks/SKILL.md` lines 21–23 say proof is a fact already written in `BRAND.md`, and they refuse invented awards, testimonials, customer quotes, logo strips, star ratings, customer counts, and press hits. The pack tells the reader to use the Purpose, Positioning, and Voice sections of `BRAND.md` and `VOICE.md` (lines 13–27). It names no client, no award, and no count. The copy pack points at the same two files and says a missing number, name, or quote is a TODO (`packages/knowledge/packs/copywriting/SKILL.md` lines 11 and 27). Test `brand and copy packs point at the brand files and do not invent proof` requires `BRAND.md`, `VOICE.md`, purpose, positioning, proof, voice, and `Do not invent awards`, plus one idea, verb buttons, a 404, and no exclamation marks in the copy pack. Test `three core packs parse and make no claim errors` requires no `%`, no 19xx or 20xx year, and an empty `lintPackClaims` result. The three files contain no exclamation mark. `problemsOf` fails the suite if one appears (`core-packs.test.ts` lines 62–70).

### Also checked

- Prompt 078 says not to copy Matt's sentences. D-005 allows verbatim prompts with credit. It does not require them. The three packs credit the method and say the sentences are original (`anti-slop/SKILL.md` line 101, `brand-frameworks/SKILL.md` line 33, `copywriting/SKILL.md` line 33). A search of `context/sources` for the pack's distinctive sentences (`Do not invent awards`, `Buttons are verbs`, `The 404 page is calm`) finds no copy of those sentences.
- `parsePack` validates each file. Paths point at the pack's own `SKILL.md`. Test `three core packs parse and make no claim errors`.
- Effort in a pack fails. Test `a pack that sets effort fails` inserts `effort: high` and expects both `problemsOf` and the `parsePack` throw.
- Word count at or above 700 fails. Test `word count over 700 fails`. The shipped packs pass `problemsOf`, so each is under 700 words.
- `CORE_PACKS` is the constant in the test file (`core-packs.test.ts` lines 8–12). Prompt step 8 says to export nothing from the package when the test reads the files.
- The 078 diff is the four files the prompt lists.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## File list

From `f433f7f` through `1a554e7`:

- `packages/knowledge/src/pack.ts`, `packages/knowledge/test/pack.test.ts`, `packages/knowledge/packs/example/SKILL.md`, `packages/knowledge/package.json`, `packages/knowledge/src/index.ts` (076)
- `packages/knowledge/golden/page.md`, `motion.md`, `qa.md`, `packages/knowledge/src/golden.ts`, `packages/knowledge/test/golden.test.ts`, `packages/engine/test/golden.test.ts`, and the `loadGolden` re-export in `packages/knowledge/src/index.ts` (077)
- `packages/knowledge/packs/anti-slop/SKILL.md`, `packages/knowledge/packs/brand-frameworks/SKILL.md`, `packages/knowledge/packs/copywriting/SKILL.md`, `packages/knowledge/test/core-packs.test.ts` (078)

No other files. No new package, surface, or library.

## UI at 375 and 1440

No file under `packages/app/` changed from `f433f7f` through `1a554e7`. These prompts write a pack checker, markdown templates, and three skill packs. No screenshot, and no visual pass is claimed.

## Live model calls

076, 077, and 078 do not ask for a model call. The diff does not touch `packages/engine/src/ai/`. Nothing in these commits is a scripted stub standing where a live call was required.

## Verification

`Test-Path hh-build-plan/reviews/079-REVIEW.md` is true once this file is written.

`pnpm --filter @hitchhiker/knowledge test`: exit 0, 24 pass, 0 fail.

`node --experimental-strip-types --test packages/engine/test/golden.test.ts`: exit 0, 5 pass, 0 fail. This command is not in the prompt verification block. It covers the engine file 077 added.

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 080 is not started.
