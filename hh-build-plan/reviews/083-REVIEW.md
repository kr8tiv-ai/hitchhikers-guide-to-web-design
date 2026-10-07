# 083 Review — prompts 080, 081, 082

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. No fix commit. No new feature. This checkpoint closes the motion recipes, the Astro, Next, and Vite usage packs, and the type, color, UX, and accessibility packs. Prompt 084 is not started.

The must-have truths for 080, 081, and 082 hold. Each one below has a test name and a file line. `pnpm --filter @hitchhiker/knowledge test`: 36 pass, 0 fail.

## History

Three build commits, in order, on top of `fbc66ce` (the 079 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `c6f7e4f` | `fbc66ce` | `feat(knowledge): add recipes for the full motion toolkit` | same, prompt 080 |
| 2 | `551f974` | `c6f7e4f` | `feat(knowledge): add Astro, Next, and Vite usage packs` | same, prompt 081 |
| 3 | `ceaad47` | `551f974` | `feat(knowledge): add type, color, UX, and a11y packs` | same, prompt 082 |

## 080 Write motion recipes for the full toolkit

### Truths

- The pack covers the full D-001 toolkit. D-001 names GSAP (ScrollTrigger and SplitText), Lenis, Three.js, raw WebGL or OGL, Motion, anime.js, Theatre.js core, CSS scroll-driven animations, and vanilla JS. `REQUIRED_RECIPES` lists those nine headings (`packages/knowledge/test/motion-pack.test.ts` lines 8–18). `recipes.md` has one section for each, and `SKILL.md` lines 12–14 say the Guide ships that toolkit and name the same ids `planMotion` uses: `gsap`, `lenis`, `three`, `ogl`, `motion`, `anime`, `theatre`, `css-scroll`, `vanilla` (`packages/engine/src/spec/motion.ts` lines 33–42). Test `the nine recipes are present, short, and split by owner` requires those headings, `gsap.ticker`, `anime.js`, Motion, `@theatre/core`, and the sentence that a page imports one recipe. Test `each recipe stays on the library planMotion can assign` requires the Lenis import with ScrollTrigger, SplitText as a GSAP plugin, `@supports (animation-timeline: view())`, `motion/react` with `whileInView`, `animejs` with `createScope`, OGL with `webgl: 2`, a dynamic `import("three")` in a different section, and an `IntersectionObserver` fade.

- Each recipe is scoped to one owner. `recipes.md` names one owner per heading: `lenis` (line 7), `gsap` (line 37), `css-scroll` (line 66), `motion` (line 101), `anime` (line 124), `ogl` (line 152), `three` (line 196), `theatre` (line 230), `vanilla` (line 262). `SKILL.md` lines 16–18 say one scroll owner, one WebGL context, and one timeline owner per element, and line 29 says to copy one heading. The same split test walks every `## ` section and fails if `animation-timeline` and `lenis` share a section. The per-recipe test requires `Owner: \`gsap\`` on SplitText, `Owner: \`motion\``, `Owner: \`anime\``, and `Owner: \`vanilla\``, and it requires the vanilla section to contain no `gsap` and no `import`. OGL, Three, and Theatre also import `gsap` so they can subscribe to `gsap.ticker`. v2 section 15.2 requires that shared clock. Each of those sections says the ticker does not own the effect. The Lenis section is the one recipe the prompt asked to combine with GSAP, and its scroll owner is `lenis`.

- Theatre is pinned and studio is excluded. `recipes.md` lines 233 and 236 import `@theatre/core` and comment `Pin @theatre/core at 0.7.2`, with `Source: hh-build-plan/RESEARCH-ADDENDUM.md section 3`. That addendum line pins `@theatre/core` at 0.7.2 and records studio as AGPL-3.0. `SKILL.md` lines 24–25 repeat the pin and say the studio editor is excluded. Test `SKILL.md parses, omits effort, and makes no unsourced claims` requires `0.7.2`, the Source line, and the absence of `@theatre/studio` and `gsap fallback`. The nine-recipe test and the per-recipe test require `@theatre/core` and forbid `@theatre/studio`.

### Also checked

- The per-recipe test does not import `planMotion`. It locks the owner ids and the imports as literals. Those literals match `MOTION_LIBS` in `motion.ts` lines 33–42, read in this review. The key link holds on those lines.
- Reduced motion is a section, not a tenth library. The nine-recipe test asserts `Reduced motion` is outside `REQUIRED_RECIPES`.
- Snippets stay under 40 lines. The nine-recipe test counts each fence.
- No price claim and no `GSAP fallback`. No npm dependency was added. The 080 diff is the three files the prompt lists.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 081 Write stack usage notes for Astro, Next, and Vite

### Truths

- Stack usage follows the decision record. `decideStack` sends level 10 to `vite-react`, an app or a persistent canvas at levels 1 to 9 to `next`, and every other case to `astro` (`packages/engine/src/spec/stack.ts` lines 129–133). Motion level is an integer from 1 to 10 (lines 101–105). SvelteKit is only an insisted override, and the record says the 3D ecosystem is thinner (line 152). The Astro pack states that pick, keeps React as an island the record must ask for, puts shared motion in `src/scripts/motion.ts`, and parks SvelteKit in an alternatives paragraph (`packages/knowledge/packs/stack-astro/SKILL.md` lines 11, 21, 25, and 39–41). The Next pack says to follow the template's router and does not invent an app or pages tree (`stack-next/SKILL.md` lines 11 and 19). The Vite pack is a single page at level 10 with an optional client-side router (`stack-vite-react/SKILL.md` lines 11 and 19). All three say `re-resolve at install`, point at `STACK-DECISION.md`, and say the lockfile pins what install resolved. Test `three stack packs parse and follow the decision record` requires those phrases, `bootMotion`, `src/scripts/motion.ts`, no `effort` key, no `x.y.z` pin, and no `@latest`. Test `Astro does not pull React Three and keeps islands as the exception` forbids `@react-three/fiber` and requires content collections, `React is not the default`, plain Three, and the SvelteKit sentence. Test `Next and Vite smoke-test React Three and do not invent a router tree` requires the smoke-test sentence for `@react-three/fiber` against the installed Three version, and the fallback to driving objects from `@theatre/core`.

- Theatre studio is excluded in every pack this prompt's file list allows. Each of the three skills says `Do not import \`@theatre/studio\`.` and names `@theatre/core` (`stack-astro/SKILL.md` line 31, `stack-next/SKILL.md` line 29, `stack-vite-react/SKILL.md` line 29). `studioExcluded` in `stack-packs.test.ts` lines 34–38 requires that ban sentence and fails if the package name remains after the sentence is removed. The three-pack test calls it for every name in `STACK_PACKS`.

### Conflict, not a failed truth

Prompt 081's goal also names seven packs from the v1 stack-usage list: `deploy-hostinger`, `deploy-vercel`, `deploy-netlify`, `deploy-cloudflare`, `imagine-prompting`, `3d-asset-sourcing`, and `scroll-video-encode` (prompt line 38). v1 lists them at `CONTEXT-PACKAGE.md` line 948. The addendum repeats them at `RESEARCH-ADDENDUM.md` lines 291–298. The same prompt's file list (lines 56–59) allows only the three framework skills and the test, and it says not to modify files outside that list. The acceptance criteria and the must-have truths do not name the seven packs. The 081 commit records that conflict and does not create the files. This review stays inside the file list, so those packs are not added here. They are not a failed must-have. No later prompt in `hh-build-plan/prompts/` names them.

D-001 asks knowledge packs to carry pinned library versions. Prompt 081 forbids an unverified pin, and `decideStack` already says to re-resolve at install. The Theatre pin stays in the motion pack, where the addendum checked 0.7.2. The stack packs follow that record. They do not invent a second pin.

### Also checked

- The 081 diff is the four files the prompt lists. No Astro, Next, or Vite project was created.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 082 Write typography, color, UX, and accessibility packs

### Truths

- Design packs do not invent marketing statistics. The UX pack opens with `Do not invent a conversion rate, a lift, or any other marketing statistic` and refuses fake countdowns (`packages/knowledge/packs/ux-conversion/SKILL.md` lines 11 and 20–23). Test `ux-conversion has no conversion percent` requires that sentence and fails on `/\d+%/` or any `%`. Contrast is written as `4.5 to 1` and `3 to 1`, with a Source line to WCAG 2.2, in the color pack (lines 21–24) and the a11y pack (lines 16–21). Test `four design packs parse, lint, and source every number` runs `parsePack` and `lintPackClaims`, and `unsourcedNumbers` fails when a line that contains a digit is not followed by a line that starts with `Source:`. The four packs pass that check. No pack contains an exclamation mark. The same test asserts that.

- Accessibility numbers match the gates. Body contrast is 4.5 and large text is 3, which is `BODY_MIN` and `LARGE_MIN` in `packages/engine/src/brand/tokens.ts` lines 45–46. `passes` documents the same bars (lines 106–109), and `proposePalettes` keeps ink only when body contrast passes. The a11y pack cites that file. Touch targets are at least 44 CSS pixels (`a11y/SKILL.md` line 28), matching v2 section 15.5. The pack says the axe `target-size` minimum of 24 is not this floor (lines 31–32), so a checker pass cannot lower the Guide floor. A serious or critical axe finding does not ship (line 11), matching the Mostly Harmless axe row in v2 section 12. `prefers-reduced-motion` turns off Lenis, scrub, and autoplay and leaves content visible (line 47), matching v2 section 15.2. Forms keep `inputmode` and `autocomplete` (lines 51–53 and the UX pack line 27). Test `a11y names contrast, target size, and reduced motion` requires `44`, `4.5`, `3 to 1`, `prefers-reduced-motion`, `WCAG 2.2`, and the sentence that axe `target-size` is not the floor. Test `color states the mixed-research caveat and does not assign one emotion` requires the mixed-research sentence, `red does not always mean danger`, and `not a law of perception`.

### Also checked

- Typography says at most two families, calls the six pairings examples, and uses `clamp()` (`typography/SKILL.md` lines 13, 17, and 32). The size line (16px, line height 1.4 to 1.6, 45 to 75 characters) cites research 07, which states that rule. Test `typography says two families and treats the six pairings as examples`.
- Effort in a pack fails. Test `a pack with effort frontmatter fails`.
- The 082 diff is the five files the prompt lists. No font files were downloaded.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## File list

From `fbc66ce` through `ceaad47`:

- `packages/knowledge/packs/motion/SKILL.md`, `packages/knowledge/packs/motion/recipes.md`, `packages/knowledge/test/motion-pack.test.ts` (080)
- `packages/knowledge/packs/stack-astro/SKILL.md`, `packages/knowledge/packs/stack-next/SKILL.md`, `packages/knowledge/packs/stack-vite-react/SKILL.md`, `packages/knowledge/test/stack-packs.test.ts` (081)
- `packages/knowledge/packs/typography/SKILL.md`, `packages/knowledge/packs/color/SKILL.md`, `packages/knowledge/packs/ux-conversion/SKILL.md`, `packages/knowledge/packs/a11y/SKILL.md`, `packages/knowledge/test/design-packs.test.ts` (082)

No other files. No new package, surface, or library.

## UI at 375 and 1440

No file under `packages/app/` changed from `fbc66ce` through `ceaad47`. These prompts write knowledge packs and tests. No screenshot, and no visual pass is claimed.

## Live model calls

080, 081, and 082 do not ask for a model call. The diff does not touch `packages/engine/src/ai/`. Nothing in these commits is a scripted stub standing where a live call was required.

## Verification

`Test-Path hh-build-plan/reviews/083-REVIEW.md` is true once this file is written.

`pnpm --filter @hitchhiker/knowledge test`: exit 0, 36 pass, 0 fail.

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 084 is not started.
