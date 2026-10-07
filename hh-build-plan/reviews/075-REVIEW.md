# 075 Review — prompts 072, 073, 074

Verdict: **PASS**

Reviewed: 2026-10-07. Fresh session. One fix commit. No new feature. This checkpoint closes the stack record, the motion picker, and the coexistence skeletons. Prompt 076 is not started.

HEAD before this review commit: `53dd420` (`fix(review): checkpoint 075 does not boot both scroll owners when the page is unset`).

The must-have truths for 072, 073, and 074 hold. Each one below has a test name and a file line. One 074 defect was false on arrival: a plan with `lenis+scrolltrigger` on one page and `native` on another treated a missing `dataset.page` as every page, so both scroll owners booted. That is fixed in `53dd420`. `pnpm --filter @hitchhiker/templates test` after the fix: 19 pass, 0 fail. `pnpm --filter @hitchhiker/engine test` after the fix: 434 pass, 0 fail, 1 skipped (`live smoke returns a two-field object`, which runs only when `HH_LIVE=1`).

## History

Three build commits, in order, on top of `e46f2dc` (the 071 review). Messages match the prompt commit lines. They are separate commits. History was not rewritten. This session does not push.

| Order | Commit | Parent | Message | Prompt commit line |
| --- | --- | --- | --- | --- |
| 1 | `5a4386d` | `e46f2dc` | `feat(spec): write STACK-DECISION.md` | same, prompt 072 |
| 2 | `2d4dd45` | `5a4386d` | `feat(spec): pick one motion library per effect` | same, prompt 073 |
| 3 | `285ac8c` | `2d4dd45` | `feat(templates): generate the motion coexistence modules` | same, prompt 074 |
| fix | `53dd420` | `285ac8c` | `fix(review): checkpoint 075 does not boot both scroll owners when the page is unset` | this review |

The diff from `e46f2dc` through `285ac8c` is the six files the prompts named, plus the step 9 barrel export in `packages/templates/src/index.ts`. Prompt 074 allows that one-line export and the commit names the file. The fix stays inside prompt 074's file list.

## Fix

Prompt 074. `onThisPage` returned true when `documentElement.dataset.page` was empty. On a mixed plan, `startLenis` and `installNativeTimeline` both ran. v2 §15.2 and the prompt require one scroll owner per scroller. Lenis is wired only when that page's `scrollOwner` says so.

Correction stays inside 074's files. `scrollOwnersConflict` in `packages/templates/src/motion-contract.ts` (lines 289–292) is true when the plan contains both `lenis+scrolltrigger` and `native`. `onThisPageLines` (lines 294–304) then requires `dataset.page` to equal the page name, and a blank page returns false. A plan with one scroll owner still boots when the attribute is unset (lines 306–314). Test `lenis and native pages can share a module without sharing a scroller` (`motion-contract.test.ts` lines 330–351) requires the fail-closed body. Test `a lenis plan wires ScrollTrigger on gsap.ticker and skips the css timeline` (lines 152–153) requires the single-owner fallback.

The second fix slot is unused.

## 072 Write the stack decision record

### Truths

- The stack record has pick, why, alternatives, and a change condition. `render` writes the headings `Pick`, `Why`, `Alternatives`, `What would change this`, and `Versions` (`packages/engine/src/spec/stack.ts` lines 214–238). `decideStack` returns `pick`, `markdown`, and `insisted` (lines 241–268). `changeText` (lines 204–211) names a persistent canvas, motion level 10, and an app-style site type. Test `a marketing site defaults to astro and not sveltekit` calls `assertRecord`, which requires those five headings, the pick in `Pick`, `re-resolve at install` in `Versions`, and the three change phrases.

- Astro is the default marketing stack. `heuristic` returns `astro` unless the level is 10, the site type is `app`, or `persistentCanvas` is true (lines 130–134). The Why line is `Astro is the default marketing stack` (line 186). Test `a marketing site defaults to astro and not sveltekit` uses site type `marketing` at level 5 and expects `astro` with `insisted` false. Test `every known site type stays off sveltekit unless the user overrides` expects `next` only for `app`, and `astro` for the other ids in `SITE_TYPES`.

- Shopify is not silently selected. The pick type is `astro | next | vite-react | sveltekit` (line 21). Every record includes `Inventory-heavy commerce escalates. It does not change the site stack by itself.` and `This record does not select Shopify.` (lines 38–39 and 190). An override of `shopify` throws `StackError` (lines 115–121). Test `commerce site types do not select Shopify` runs `sales` and `funnel` at levels 3, 6 with a canvas, and 10, and expects `astro`, `next`, and `vite-react`. Test `an override outside the set throws` expects the `shopify` throw. `assertRecord` rejects a pick of `shopify`.

### Also checked

- Level 10 selects `vite-react`, including over site type `app` and a persistent canvas. The Why sentence is `Vite plus React wins because the world is the harder constraint.` Tests `level 10 and site type app: vite-react wins because the world is harder` and `persistent canvas at level 9 stays next, and level 10 still selects vite-react`.
- A persistent canvas at levels 1 to 9 selects `next` for every site type. v2 §10.4 says Next.js for app features or one persistent canvas across routes. The prompt context says the same. The edge-case phrase "Astro otherwise" is the no-canvas case: a marketing site at level 9 with no canvas stays `astro`, and the Why text says so. The same test locks that.
- `userOverride` wins and sets `insisted` true, including when the override matches the heuristic. `sveltekit` is honored and the Why text says the 3D ecosystem is thinner. It is not the default. Tests `a sveltekit override is honored and insisted`, `an override wins over the heuristic`, and `insisted stays true when the override matches the heuristic`.
- Alternatives name every stack that was not picked. When the pick is not `sveltekit`, the SvelteKit line says `The 3D ecosystem is thinner.` `assertRecord` checks the id list.
- `motionLevel` outside the integers 1 to 10 throws. Test `motion level outside 1 to 10 throws`.
- Versions contain `re-resolve at install` and `2026-10-05` with `not a pin` (lines 41–45). `assertRecord` rejects a `\d+\.\d+\.\d+` pin. D-001 asks the record to carry pinned toolkit versions. This prompt forbids a pin that was not resolved from a registry in the session. The 072 commit records that split. The `@theatre/core@0.7.2` pin is in the motion record, from v2 §15.1, not in this Versions section.
- Markdown drops an exclamation mark in the site type. Test `a site type exclamation mark is dropped from the record`.
- `decideStack` is exported from `packages/engine/src/spec/stack.ts`. The engine barrel is outside this prompt's file list. No framework was installed.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 073 Assign one library per effect in MOTION.md

### Truths

- One library owns each effect. `assignOne` returns one `MotionLib` per request (`packages/engine/src/spec/motion.ts` lines 267–327). `assertOneOwner` throws `CoexistenceError` when the same page and element already have a different library (lines 329–340). A scroll sequence is `gsap`. Lenis, when the page qualifies, is a separate row on `documentElement` (lines 375–388). Test `two effects on the same element with different libraries throw` uses a scroll sequence and an SVG stagger on `hero`. Test `the same element may use one library twice, and the same name on another page` allows two `gsap` rows on one element and `anime` on that element name on another page. Test `adding a css-scroll effect to a Lenis plan throws CoexistenceError` requires the message `Neither effect was dropped`.

- Appetite is a weight ceiling. `cleanAppetite` accepts only integers 1 to 10 (lines 165–169). Lenis is added only at appetite 3 or above, and only when the page is not an explicit `css-scroll` page (lines 353 and 362). A `3d` request assigns `three` at appetite 8 or above, or when `allowHeavy` is true. Below that it assigns `vanilla` with the note `phone still or prerender` and a warning (lines 305–312). The markdown says `Appetite is a weight ceiling. It does not remove a library from the Guide.` (line 433). Test `appetite 4 with a 3d request and allowHeavy false does not assign three`. Test `appetite 8 assigns three for a 3d moment`. Test `allowHeavy assigns three below the level 8 ceiling`. Test `smooth scroll at appetite 3 assigns lenis, and below 3 it does not`. Test `a scroll sequence below appetite 3 stays on gsap without Lenis`. Test `appetite outside 1 to 10 throws`. Test `the toolkit line lists all nine libraries on a calm plan and on an empty plan` requires the nine ids at appetite 1.

- Theatre means core, not studio. `THEATRE_NOTE` is `` `@theatre/core` pinned at 0.7.2, never studio. `` (line 139). `cinematic-timeline` assigns `theatre` and that note (lines 314–320). `renderMotionMd` throws if the markdown contains `@theatre/studio` or `gsap fallback` (lines 469–470), and it prints `No GSAP fallback.` (line 437) plus the core sentence (line 459). Test `theatre assignment names core and the markdown refuses studio` requires `@theatre/core`, `pinned at 0.7.2`, `never studio`, and the absence of `@theatre/studio` and `gsap fallback`.

### Also checked

- A light reveal at appetite 2 assigns `css-scroll`, scroll owner `native`, and no Lenis. The same page at appetite 10 stays native when nothing else asks for Lenis. Tests `a light reveal at appetite 2 assigns css-scroll and stays native` and `a light reveal stays on css-scroll at appetite 10 when the page does not ask for Lenis`.
- A scroll sequence at appetite 5 assigns `gsap` and `lenis`, and the page owner is `lenis+scrolltrigger`. A light reveal on that page becomes `gsap`. Tests `a scroll sequence at appetite 5 assigns gsap and lenis` and `a light reveal on a Lenis page uses GSAP`.
- Lenis and `css-scroll` may sit on different pages. Test `Lenis and css-scroll may live on different pages`.
- `react-island` assigns `motion` on `next` and `vite-react`, and `gsap` on `astro`. `sveltekit` assigns `gsap` and warns `The 3D ecosystem is thinner.` Tests `astro turns react-island into gsap, and next and vite-react assign motion` and `sveltekit treats react-island as gsap and warns about the thinner 3D ecosystem`.
- `shader` assigns `ogl` until `three` is on that page, then stays on `three` with a one-WebGL-context warning. Test `a shader uses ogl until three is assigned, then stays on three`.
- Unknown kinds throw. `magnetic` throws. Tests `an unknown kind throws` and `magnetic buttons are refused`.
- The toolkit line is `Toolkit: gsap, lenis, three, ogl, motion, anime, theatre, css-scroll, vanilla.` on every plan, including an empty one. `assertDoc` requires `No GSAP fallback.` and `The stack pick comes from decideStack.`
- `planMotion` takes a `StackPick` imported from `./stack.ts` (line 20). The locked interface passes the pick in. It does not call `decideStack` itself. The markdown names that source. Test `planMotion is exported`.
- Empty requests return `scrollOwner` as `{}`, an empty assignment list, and the scroll-owner section text `none`. Test `the toolkit line lists all nine libraries on a calm plan and on an empty plan`.
- A `cinematic-timeline` below level 9 still assigns `theatre` and warns that the effect starts at level 9. The prompt assigns theatre for that kind. The 3d rewrite is the ceiling case the prompt spells out. Test `the cinematic family id is the same theatre assignment`.
- Each kind carries an A1–H3 label. `tiny-fade` is labeled `H1, H2, H3`. In research 04 those three ids are media and sound, and the effect owner is still `vanilla`. The must-have is the owner, and the prompt does not name one id per kind. The labels stay as the tests locked them.
- `.hitchhiker-dev/summaries` is absent, so the commit body is the summary.

## 074 Encode the ticker, scroll, and WebGL coexistence rules

### Truths

- Generated motion code follows the coexistence rules. `renderMotionModule` (`packages/templates/src/motion-contract.ts` line 317) imports `gsap` only when an assignment uses `gsap` or `lenis` (`hasGsap`, lines 158–160). A Lenis plan emits `ScrollTrigger`, `gsap.ticker`, and `startLenis`, and it does not emit `animation-timeline`. `startLenis` returns before `new Lenis` when `prefersReducedMotion()` is true (generator lines 447–454). `bindGsap` returns before `scrub` (lines 499–500, scrub at line 518). A native `css-scroll` plan emits `animation-timeline` and does not contain `lenis`. `onTick` subscribes to `gsap.ticker` when GSAP is in the graph (lines 365–378) and otherwise contains the only `requestAnimationFrame` (lines 381–406). Three, Theatre, and OGL call `onTick` and do not start their own loop. `assertExclusive` throws when the markdown names both scroll mechanisms or one page lists both `lenis` and `css-scroll` (lines 166–226). The header says the file was generated from `MOTION.md` and should not be hand-forked into a second ticker, and `The Guide chose one scroll owner` (lines 248–256). Tests `a lenis plan wires ScrollTrigger on gsap.ticker and skips the css timeline`, `a native css plan sets animation-timeline and does not name lenis`, `vanilla motion has no gsap import and one rAF helper`, `an empty plan respects reduced motion and does nothing else`, `markdown that names both scroll mechanisms is refused`, and `one page cannot list lenis and css-scroll even if planMotion did not build it`. The mixed-page fail-closed gate is the fix above.

- Libraries that were not picked are not imported. Imports are appended only for libraries present on the plan (lines 325–344). Three is a comment, `// three would load here: import("three")`, not a static import. Theatre imports `{ getProject } from "@theatre/core"` and the next line is `Pin @theatre/core at 0.7.2. Do not import studio.` The source does not mention `@theatre/studio` or `@latest`. Test `libraries that were not picked are not imported` expects a React-island plan to import only `motion`, and an anime-plus-vanilla plan to import only `animejs`, with one `requestAnimationFrame` in `onTick`. Test `a lenis plan wires ScrollTrigger on gsap.ticker and skips the css timeline` forbids static imports of `three`, `ogl`, `motion`, `animejs`, and `@theatre/core`. Test `three, theatre, and ogl share one context and the calm phone hook` requires the core import and the pin comment, and forbids a static `three` import and `@theatre/studio`.

- Heavy effects have a calm-path hook. `calmPhonePath` is emitted when the plan assigns `three`, `ogl`, or `theatre` (lines 409–417). `mountThree`, `mountOgl`, and `mountTheatre` return when it returns true (lines 595, 616, and 637). `renderWebglModule` (line 664) exports `getContext`. With a heavy assignment it keeps one `WebGL2RenderingContext`, returns it for the same canvas id, and throws `one context per page` for a second id (lines 679–686). A plan with no heavy assignment exports a `getContext` that throws and does not call `webgl2`. Test `three, theatre, and ogl share one context and the calm phone hook` requires the comment `Heavy effects must call calmPhonePath`, the calls inside `mountThree` and `mountTheatre`, the shader plan's `calmPhonePath(`, `getContext`, and the second-canvas throw. Test `vanilla motion has no gsap import and one rAF helper` requires a calm plan to omit `calmPhonePath`.

### Also checked

- Reduced motion is code. `prefersReducedMotion` calls `matchMedia("(prefers-reduced-motion: reduce)")` (lines 354–356). `bootMotion` calls `keepContentVisible` before that check. The generated source does not contain `autoplay`. `assertReducedMotion` in the test file locks the order and the visibility assignment.
- A vanilla plan has no `gsap` import and one `requestAnimationFrame`, inside `onTick`. An empty plan does the same and does not start Lenis, a CSS timeline, or a calm-path hook.
- A SvelteKit warning is copied as a comment. Test `a sveltekit warning is copied as a comment`.
- `requestAnimationFrame` is absent from `bindVanilla`, `bindAnime`, `mountThree`, and `mountTheatre`. The count tests require one occurrence, inside `onTick`, when GSAP is absent, and zero when `gsap.ticker` is the loop.
- D-001 asks for one render loop, ideally `gsap.ticker`. The prompt says to import `gsap` only when an assignment uses `gsap` or `lenis`, and to use one `requestAnimationFrame` helper otherwise. A heavy effect at appetite 3 or above also receives Lenis, so it rides `gsap.ticker`. Below that, the single rAF helper is the loop and `gsap` stays unimported.
- A scroll sequence below appetite 3 has scroll owner `native`, so the source contains `animation-timeline` and `ScrollTrigger`, and it does not contain `lenis`. Prompt step 2 asks for that pair of strings. The CSS rule targets `.hh-native-scroll`. The sequence element is not that selector. Test `a native scroll sequence keeps gsap on the native scroller`.
- `renderMotionModule` and `renderWebglModule` are exported from `packages/templates/src/index.ts` (lines 5–6). Test `the package barrel exports the motion renderers`. `MotionPlan` in the template file is a structural copy. The engine barrel does not export `planMotion`, and a deep import would fail the boundary scan. The test loads `planMotion` by file URL from `packages/engine/src/spec/motion.ts` and passes that object's output in. The boundary test `the repo has no deep imports and no package escapes` still passes, because the loader builds the URL at runtime.
- `.hitchhiker-dev/summaries` is absent, so the 074 commit body is the summary.

## File list

From `e46f2dc` through `53dd420`:

- `packages/engine/src/spec/stack.ts` and `packages/engine/test/stack.test.ts` (072)
- `packages/engine/src/spec/motion.ts` and `packages/engine/test/motion.test.ts` (073)
- `packages/templates/src/motion-contract.ts` and `packages/templates/test/motion-contract.test.ts` (074, plus this fix)
- `packages/templates/src/index.ts` (074 step 9 export)

No other files. No new package, surface, or library.

## UI at 375 and 1440

No file under `packages/app/` changed from `e46f2dc` through this review. These prompts write a stack record, a motion plan, and generated script strings. No screenshot, and no visual pass is claimed.

## Live model calls

072, 073, and 074 do not ask for a model call. `decideStack`, `planMotion`, and `renderMotionModule` do not import `packages/engine/src/ai/`. Nothing in these diffs is a scripted stub standing where a live call was required. The engine suite still skips `live smoke returns a two-field object` unless `HH_LIVE=1`. This run skipped it.

## Verification

`Test-Path hh-build-plan/reviews/075-REVIEW.md` is true once this file is written.

`pnpm --filter @hitchhiker/templates test` after the fix: exit 0, 19 pass, 0 fail.

`pnpm --filter @hitchhiker/engine test` after the fix: exit 0, 434 pass, 0 fail, 1 skipped.

No new feature. No architecture change. No test was weakened. No push, no deploy, no remote. Prompt 076 is not started.
