# 091 Review — prompts 088, 089, 090

Verdict: **PASS_WITH_KNOWN_ISSUES**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. Prompt 092 is not started.

The must-have truths for 088, 089, and 090 hold. Each one below has a test name and a file line. This session ran `pnpm --filter @hitchhiker/engine test`: 481 pass, 1 fail, 1 skipped. The single failure is `package.json dependencies match BOUNDARIES`, which these three commits do not touch. That is why the verdict is not a clean PASS. The skipped test is the live Grok smoke, which stays off unless `HH_LIVE=1`.

## History

Three build commits, in order, on top of `69fee19` (the 087 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `4cc8d0e` | `69fee19` | `feat(spec): plan sections and the hero slice name` | same, prompt 088 |
| 2 | `2771471` | `4cc8d0e` | `feat(spec): assemble CONTEXT.md as anchors` | same, prompt 089 |
| 3 | `6386728` | `2771471` | `feat(spec): generate the 50 to 150 site prompts` | same, prompt 090 |

## 088 Plan sections and name the hero Infinite Improbability

### Truths

- Heart of Gold is not the hero slice name. `HERO_SLICE` is `Infinite Improbability` (`packages/engine/src/spec/sections.ts` line 48). The visual file prints `Hero slice: Infinite Improbability` (line 359). Test `the module does not name the hero Heart of Gold` (`packages/engine/test/sections.test.ts` lines 52–57) reads `sections.ts` and requires that string to be absent and `Infinite Improbability` to be present. Test `a two-page plan names the hero Infinite Improbability and gives each section one wow` (lines 59–97) requires `Slice: Infinite Improbability` and `Name: Infinite Improbability` on the hero, and `Slice: none` on the second page. The same test requires the visual line. A second assertion in `one motion-plan effect lands on the hero and keeps that library name` (line 136) requires the plan text to omit `Heart of Gold`.

- Every heavy section has crawlable text. Heavy libraries are `three` and `theatre` (`sections.ts` lines 52–54), which is the pair prompt 088 step 4 names. `heavyText` throws when the fallback is missing or shorter than 20 characters (lines 281–291). The section block prints `- Text:` and, for a heavy effect, `The text line is crawlable in the page, outside the WebGL context` (lines 321–325). Test `three and theatre without a long text fallback throw` (lines 185–212) rejects an empty fallback and a 19-character fallback (`Crawlable text here` without the period), accepts the 20-character sentence `Crawlable text here.`, and requires the crawlable line. A light library still prints a text line: test `a light library does not require a text fallback` (lines 214–224) requires `ogl` to print the page purpose as `- Text:`.

- One effect per section. `placeEffects` throws when a second effect id lands on a section that already has one (`sections.ts` lines 260–265). An unplaced assignment also throws (lines 273–277), so a motion-plan row is not dropped on the floor. Test `two effects on one section throw` (lines 139–162) requires the message `cannot have two effects` and both ids. Test `an unplaced effect throws` (lines 164–183) requires the leftover id.

### Also checked

- `planSections` takes library names from `MOTION_LIBS` in `packages/engine/src/spec/motion.ts` (sections.ts lines 26 and 139–145). Test `one motion-plan effect lands on the hero and keeps that library name` calls `planMotion` and requires the hero `Library:` line to equal that assignment's library.
- The return is `{ sectionPlan, visual }`. Both files are markdown. The plan has no `lorem` and no exclamation mark (`assertClean`, sections.test.ts lines 40–45).
- The typed input has no sections array, so the planner builds one section per page. The first section id is `hero`. Later section ids are the page ids (`sections.ts` lines 189–212). Prompt 088's interface is that shape. Prompt 090 takes sections on its own input and does not call `planSections`.
- `planMotion` can emit Lenis plus a wow. Two assignments need an explicit `effects` map, and two effects cannot share a section. The motion-plan test places only the `three` row on the hero. Lenis stays in `MOTION.md` unless the caller gives it a section of its own.

## 089 Assemble CONTEXT.md with anchors under the token budget

### Truths

- CONTEXT.md stays a map, not a dump. `assembleContext` writes the sentence `This file is a map. It points at the specs. It does not paste them.` and then seven headings (`packages/engine/src/spec/context-doc.ts` lines 178–194). Brand, voice, motion, stack, and sections are each one anchor line plus the caller's gloss (lines 151–160). The module does not import `node:fs` and does not read a spec from disk (lines 1–4 and 202–216). Test `assembleContext is a map of anchors, not a pasted spec` (`packages/engine/test/context-doc.test.ts` lines 69–121) requires the anchor lines and forbids a pasted `### Three hundred` story. Test `the token ceiling throws and the source does not read specs from disk` (lines 175–194) requires `TOKEN_CEILING` of 30000, a throw above it, and the absence of `node:fs`, `readFile`, and `$10-20` in the source. `estimateTokens("")` is 0 and a 10-word string is 13 (test lines 62–67; implementation lines 101–108, `Math.ceil(words * 1.3)`). A 40-word gloss is kept and 41 throws (test lines 123–139; cap at context-doc.ts line 30).

- Motion coexistence is mentioned once in Rules. The word appears as the single heading `### Coexistence` (`context-doc.ts` line 171). The list under it is the coexistence rules, including `one scroll owner per page` (lines 61–70). Anti-slop is a separate list and includes `no exclamation marks` (lines 52–59). Test `assembleContext is a map of anchors, not a pasted spec` counts `/coexistence/gi` across the whole file and requires length 1, requires the heading inside Rules, and requires the Motion section to omit the word (lines 114–120).

### Also checked

- Anchor ids match the H1s the writers emit. Test `anchor ids match the headings the spec writers emit` (lines 196–218) reads `brain.ts` (`# Purpose`), `voice.ts` (`# VOICE`), `motion.ts` (`# MOTION`), `stack.ts` (`# STACK-DECISION`), `sections.ts` (`# SECTION-PLAN`), and the PRD line for `.hitchhiker/research/STACK-DECISION.md`. The constants are `BRAND.md#purpose`, `VOICE.md#voice`, `MOTION.md#motion`, `research/STACK-DECISION.md#stack-decision`, and `SECTION-PLAN.md#section-plan` (`context-doc.ts` lines 32–38). The research path is the path `decideStack` and the PRD already use. Prompt 089's example list names `STACK-DECISION.md` beside the other four files. The implementation keeps the research directory so the anchor points at the file those writers name.
- Empty glosses throw. A name that contains a newline throws (tests lines 141–173).

## 090 Generate the site prompt skeleton (50 to 150) and the package validator

### Truths

- Site prompts are grouped into the six locked phases and ordered by dependency. `SITE_PHASES` is `dont-panic`, `babel-fish`, `deep-thought`, `improbability-drive`, `mostly-harmless`, `so-long` (`packages/engine/src/spec/site-prompts.ts` lines 38–45). Slices are the v2 §5.2 catalog, including `Infinite Improbability` on Improbability Drive and `Heart of Gold` only on Babel Fish (lines 47–88). `finalize` sets `dependsOn` to the previous id, or an empty list for `001` (lines 1109–1120). Test `a 3-page calm fixture yields 50 to 150 real entries` (`packages/engine/test/site-prompts.test.ts` lines 86–169) requires every phase, a non-decreasing phase rank, catalog slices, and a dependency chain. This session printed that fixture: 63 prompts, phases 1 / 3 / 2 / 37 / 15 / 5 in the locked order. The one `kind: "once-over"` entry is `043`, tier Forty-Two, effort `xhigh`, phase `improbability-drive`, and it is the last prompt before `mostly-harmless` (generator lines 860–869; the same test, lines 123–132). Test `depends-forward is an error and the package is not reordered` (`site-validate.test.ts` lines 204–215) points `001` at `002` and requires rule `depends-forward` with the id order unchanged. `reviewFlags` sets `reviewAfter` on every third entry inside a phase and on the last entry of that phase (`site-prompts.ts` lines 1088–1103). Test `review-cadence rejects a skipped phase-end flag` locks the validator to that same rule.

- The count reflects real work units; nothing is padded. `generateSkeleton` throws above 150 with `Split into milestones` (lines 1139–1142) and, under 50, returns the list unchanged plus one warning that names Before we jump, Deep Thought, and under-planned sections (lines 1150–1154). There is no loop that inserts prompts to reach 50. Test `a one-page site stays under 50 and warns instead of padding` (lines 177–193) and test `more than 150 prompts throws and asks for milestones` (lines 195–219) lock both edges. Test `a 3-page calm fixture yields 50 to 150 real entries` rejects the substring `filler` on id, title, and requirements. This session measured the calm fixture at 63 and the one-page fixture at 38 with that single warning. The 63 breaks down as the six phase-coverage entries (routes, tokens, logo, voice, section registry, requirements), scaffold, fonts, shell, ticker, nav, one route per page, two prompts per section (layout, copy), one image prompt per section, one prompt per effect, feature, integration, and SEO item, then performance, credits, the once-over, the ten Mostly Harmless gates, the jury, the four Elevate passes, and the five So Long prompts (prelaunch, deploy, post-deploy, handoff, launch). The one-page fixture keeps the same gates and omits the missing pages, effects, features, integrations, and SEO items.

- One effect library is named per motion prompt. `motionTitle` is `Bind ${library} on the ${sectionId} section` plus `MOTION_BIND_SENTENCE` (`site-prompts.ts` lines 90 and 558–561). The skeleton sets `library` to that one `MotionLib`. A `three`, `ogl`, or `theatre` effect is one Magrathea entry. Any other library is one Pan Galactic Gargle Blaster entry. The shared ticker says `Import no effect library` and leaves `library` unset (lines 699–705). Test `a 3-page calm fixture yields 50 to 150 real entries` requires exactly one motion prompt, library `css-scroll`, the bind sentence, and a clock title that does not name the other libraries. Test `3D entries appear only for three, ogl, and theatre` (lines 271–306) requires those three libraries, forbids a second `Bind <other library>` prefix, and requires the theatre title to say `pinned at 0.7.2` and `never studio`. Test `motion-library requires the single-library sentence` (`site-validate.test.ts` lines 217–223) rejects a body that drops the sentence. `SITE_RULES` says `Import only the libraries this prompt names` and `Do not load every motion library on this page` (`site-rules.ts` line 14).

- The package is for the user's site. Paths come from the chosen stack: Astro `src/pages/index.astro`, Next `src/app/page.tsx` (the `next-app` starter's router), Vite `src/world/World.tsx`, SvelteKit `src/routes/+page.svelte` (`site-prompts.ts` lines 453–481). Test `a 3-page calm fixture yields 50 to 150 real entries` requires `src/pages/index.astro` on the home route. Test `next and vite paths stay on those stacks` and test `sveltekit still gets entries and warns that templates are thinner` require those trees and reject a foreign extension. No skeleton path is under `packages/` or `hh-build-plan/`. The hero structure prompt's slice is `Infinite Improbability` (test lines 136–141). `improbability-drive` does not use the slice `Heart of Gold`.

### Also checked

- `validatePackage` names every stage-3 rule: `rules-identical`, `frontmatter-complete`, `read-first-anchor`, `must-haves`, `no-as-before`, `no-see-above`, `no-same-as-previous`, `one-job`, `stack-paths`, `phase-coverage`, `review-cadence`, plus `depends-forward` and `motion-library` (`site-validate.ts` lines 27–40). Test `no-as-before rejects a body containing as before` (lines 150–156) is one test of that set. Test `validatePackage accepts a generated package for each stack` passes for astro, next, vite-react, and sveltekit.
- `SITE_RULES` is one constant. `site-prompts.ts` re-exports it. Test `RULES is one constant shared with the skeleton module` requires the motion toolkit line, `@theatre/studio` banned, `@theatre/core` pinned, one scroll owner, one ticker, one WebGL context, phone Lighthouse at least 90, and no exclamation mark (`site-rules.ts` lines 8–19).
- Bodies are not written here. `SitePromptSkeleton` has no `body`. Prompt 090 step 9 assigns prose to prompt 092 through the 011 adapter. `generateSkeleton` does not import `packages/engine/src/ai/`.
- `reviewAfter` follows prompt 090 step 5 (every third entry inside a phase, and the phase's last entry). v1 §11.1 and v2 §11.1 also describe a global prompt index `% 3`. On a three-prompt phase the two rules disagree about the middle entry. The tests lock step 5. This review leaves that choice in place.
- The once-over uses slice `Sub-Etha Signal` because v2 §5.2 has no separate final-pass slice. Kind, tier, effort, and position match v2 §11.4.
- Next paths follow `packages/templates/next-app/src/app`. The Next knowledge pack says the template owns the router. Vite paths follow `packages/templates/vite-react-world/src/world`.
- Lenis and `css-scroll` on one page throw (test `lenis and css-scroll on one page throw`). An unknown library throws.

## Known issues

- `pnpm --filter @hitchhiker/engine test` exits 1. The only failure is `package.json dependencies match BOUNDARIES` (`packages/engine/test/boundaries.test.ts` line 95). `@hitchhiker/assets` depends on `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `draco3dgltf`, and `meshoptimizer` (`packages/assets/package.json` lines 19–26). `BOUNDARIES` for that package lists `@hitchhiker/engine` and an `allowExternal` set that stops at `svgo` (`packages/engine/src/boundaries.ts` lines 33–37). Prompt 085 added those packages. Prompts 088, 089, and 090 do not change `boundaries.ts` or `packages/assets/package.json`. The diff from `69fee19` to `6386728` is the nine spec and test files named below. Auto-fix for this checkpoint stays inside those prompts' file lists, so this review does not edit the allow list. The app does not fail to start because of it.

- `planSections` and `generateSkeleton` do not call each other. A page with several sections is one section in `SECTION-PLAN.md` and many sections in the site-prompt skeleton. Both match the interface in their own prompt.

- A hero that needs Lenis and a wow cannot put both on the one `hero` section. That is the one-effect rule. The caller places Lenis on another section or leaves it in `MOTION.md`.

- Imagery is one prompt per section even when the input has no asset rows. The title says to leave a TODO when no image was supplied. That is the imagery step in v1 §10.5's build order. Removing those prompts would leave the calm fixture at 56, still inside 50–150, and the one-page fixture under 50 with the same warning. They are not the pad that hits the floor.

- Motion prompts name `src/scripts/motion.ts`. The stack packs from prompt 081 use that path. The three starters from prompt 086 keep the shared module at `src/hh/motion.ts`. The validator allows `src/scripts/` and would reject `src/hh/` until its path list changed. This review does not retarget either tree.

- `validatePackage` does not require the Forty-Two once-over. `generateSkeleton` does, and the calm-fixture test locks the count, tier, effort, and position. A later edit could drop that entry and still pass the validator.

## File list

From `69fee19` through `6386728`:

- 088: `packages/engine/src/spec/sections.ts`, `packages/engine/test/sections.test.ts`
- 089: `packages/engine/src/spec/context-doc.ts`, `packages/engine/test/context-doc.test.ts`
- 090: `packages/engine/src/spec/site-prompts.ts`, `packages/engine/src/spec/site-rules.ts`, `packages/engine/src/spec/site-validate.ts`, `packages/engine/test/site-prompts.test.ts`, `packages/engine/test/site-validate.test.ts`

No file outside those lists. No file under `packages/app/`. No new package category, no library swap.

## UI at 375 and 1440

No file under `packages/app/` changed from `69fee19` through `6386728`. These prompts do not change a Guide app screen. No screenshot at 375 or 1440, and no visual pass of `packages/app/src/design/`, is claimed.

## Live model calls

088, 089, and 090 do not ask this session to call Grok. The diff does not touch `packages/engine/src/ai/`. Prompt 090 step 9 leaves prompt bodies to 092, which is specified to go through the 011 adapter. `generateSkeleton` writes titles, paths, and the `library` field. It does not write a scripted body standing in for that call.

## Verification

`Test-Path hh-build-plan/reviews/091-REVIEW.md` is true once this file is written.

`pnpm --filter @hitchhiker/engine test`: exit 1. 481 pass, 1 fail, 1 skipped. Duration 6101 ms. The fail is `package.json dependencies match BOUNDARIES`, described above. Tests for 088, 089, and 090 passed in that run, including `the module does not name the hero Heart of Gold`, `two effects on one section throw`, `three and theatre without a long text fallback throw`, `assembleContext is a map of anchors, not a pasted spec`, `a 3-page calm fixture yields 50 to 150 real entries`, `a one-page site stays under 50 and warns instead of padding`, `no-as-before rejects a body containing as before`, and `motion-library requires the single-library sentence`.

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 092 is not started.
