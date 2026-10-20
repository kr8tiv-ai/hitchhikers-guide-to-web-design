# 240r summary

Date: 2026-10-19. Research only. The four notes are this file, `240r-fonts.md`, `240r-devices-and-polish.md`, and `240r-harness-ideas.md`.

Stance, repeated so a later spec cannot miss it: the phone keeps the picture. Adaptive DPR, a shorter post chain, compressed textures and meshes, level of detail, and a poster that is the LCP image. A width cutoff that swaps the scene for a poster is the behaviour to remove (`shouldUsePoster` in `packages/templates/shared/webgl.ts`). Gates measure outcomes. They do not ban a library.

## Audit items

The 13 items are from `hh-build-plan/research/hh-quality-gap-audit-2026-10-19.md` section 5. "How to measure" names a check the 241 spec can turn into a test. It is not a test that exists today.

| # | Audit item | Recommended approach | How to measure in code | Sources |
| --- | --- | --- | --- | --- |
| 1 | Font policy in code | Replace the six `TYPE_PAIRINGS` with the 48-pair appendix (JSON `pairs` only; prose 49, 50, and 52 are not in that count). `OVERUSED_DEFAULTS` (Inter, Poppins, Roboto, Open Sans, Montserrat, Lato, Nunito, Raleway, Playfair Display, Bebas Neue, Plus Jakarta Sans, JetBrains Mono, and Arial, Helvetica, or `system-ui` as the display face) are refused unless the person named that family. Inter leaves the default deal. | `pickType` in `packages/engine/src/brand/tokens.ts` returns a pair from the appendix for the mood, and a fixture that does not name Inter does not get Inter. | `240r-fonts.md`. Fontshare license pages and the Fontshare API, cited there. |
| 2 | Built-site type gate | At most two families on visible text. Computed family is a brand family (`document.fonts.check`). Display-to-body size ratio meets the world minimum at 375 and 1440. Body at least 16px. Line-height 1.45–1.6. Measure 45–75ch. woff2, self-hosted for OFL, `font-display` `swap` or `optional`, headline preloaded. Byte budget: headline ≤ 40 KB, body ≤ 45 KB, all font files ≤ 120 KB. | A Playwright type gate at 375 and 1440 reads computed styles and sums font transfer size. | `240r-fonts.md`. Chrome fallback article and the CSS2 API, cited there. |
| 3 | Font license check | `CREDITS.json` lists every shipped family. OFL ships the subset woff2 plus `OFL.txt`. ITF FFL is named and linked. The desk does not vendor those files into the handoff. Pangram trial faces are not defaults. | Extend `packages/qa/src/licenses.ts`. A fixture that vendors a Fontshare FFL file fails. A fixture that ships Fraunces without `OFL.txt` fails. | `240r-fonts.md` license section. https://www.fontshare.com/licenses/itf-ffl, https://www.fontshare.com/licenses/sil-ofl, https://pangrampangram.com/pages/faq, https://www.collletttivo.it/licensing. |
| 4 | Type scale from the brief | Ratio by world: editorial 1.333 (min display/body 3.2), 3d-world 1.414 (3.5), playful 1.25 (2.6), brutalist 1.5 (4.0), product 1.2 (2.2), fashion 1.414 (3.5), civic 1.25 (2.6). Write the two family names and the ratio into DESIGN.md. | `writeDesignMd` output contains the families and the ratio. A brutalist fixture whose display is under 4× the body fails. | `240r-fonts.md` scale table. The current fixed scale is in `packages/engine/src/spec/design-outputs.ts`. |
| 5 | Wire beauty and recipe into elevate, verdict, and jury | The runner calls `judgeBeauty` and `checkRecipes` / `checkRecipeDir`. 240c may already plan this. 241e makes it a test that the runner does call them, so a later edit cannot drop the call. | A test imports the runner and asserts both functions run on a fixture project. Functions today: `judgeBeauty` in `packages/qa/src/beauty-gate.ts`, `checkRecipes` and `checkRecipeDir` in `packages/qa/src/recipe-check.ts`. | Audit item 5. This repo's exports, read this pass. |
| 6 | Vision rubric font items, plus Prompt 23 bans | Separate booleans: generic or AI-default type, weak display/body contrast, blob hero, three icon cards, cloned rhythm, stock laptop people, fake logos, fake testimonials, fake numbers. | The vision result (`packages/qa/src/zaphod-vision.ts`) exposes each boolean, and `judgeBeauty` fails when any is true. | Audit item 6. Overused list in `240r-fonts.md`. Harness idea 3. |
| 7 | Device matrix | Playwright projects: WebKit `iPhone 15` and landscape, Chromium `Pixel 7`, WebKit `iPad Pro 11` portrait and landscape, Chromium `Galaxy Tab S9`, desktop at 1440 and 1920, plus widths 390 and 430. Spread the installed descriptor. Fail if the key is missing. | Each project captures screenshots, the detail pass, and a scroll strip. `packages/qa/src/playwright-opener.ts` gains a WebKit project. | `240r-devices-and-polish.md` section 1. Descriptor file at Playwright commit `e4af1585` (20 Nov 2025). https://playwright.dev/docs/emulation. |
| 8 | Mobile-specific checks | No horizontal overflow. Hero uses `svh` (and `dvh` only where a jump is acceptable), not bare `100vh` alone. Fixed UI uses safe-area insets. Primary targets ≥ 44px. No hover-only content and no custom cursor under `pointer: coarse`. Video is `muted`, `playsinline`, and has a poster. The poster is the path when autoplay is blocked, not the path for every phone. Menu: open, close, Escape, focus trap, focus return. | Playwright assertions in each device project, including WebKit. | `240r-devices-and-polish.md` section 2. https://webkit.org/blog/6784/new-video-policies-for-ios/, https://developer.chrome.com/blog/autoplay/, https://webkit.org/blog/7929/designing-websites-for-iphone-x/, WCAG 2.5.8 and 2.5.5. |
| 9 | WebGL robustness | GPU tier from `@pmndrs/detect-gpu`, DPR cap 2 / 1.5 / 1 by tier, PerformanceMonitor step-down, KTX2, Meshopt (Draco only off the first frame), instancing kept, post chain shortened by tier, pause offscreen and on a hidden tab, context-loss recovery, art-directed still at tier 0. Width and core count do not select the still. GLB budget stays 5 MiB. | A 400px viewport with a tier-3 override still starts the loop. Two context losses show the still. A second context throws. A GLB over 5 MiB fails `evaluatePerformance`. | `240r-devices-and-polish.md` section 3. https://github.com/pmndrs/detect-gpu, https://threejs.org/docs/#examples/en/loaders/KTX2Loader, `packages/qa/src/performance-gate.ts`. |
| 10 | Lighthouse per device | Mobile preset gates performance ≥ 90, LCP ≤ 2.5 s, CLS ≤ 0.1. Desktop preset gates the same floors (today desktop does not change status). Tablet is desktop scoring on a tablet viewport. Lab INP is not a failure when Lighthouse has no sample. TBT is the proxy. Poster `<img fetchpriority="high">` is the WebGL LCP element. | `packages/qa/src/lighthouse-gate.ts` and `packages/qa/src/performance-gate.ts`. Three configs, recorded form factor, and a WebGL fixture whose LCP node is the poster image. | `240r-devices-and-polish.md` section 4. https://web.dev/articles/vitals, https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md, https://github.com/GoogleChrome/lighthouse/blob/main/docs/emulation.md, `core/config/constants.js`, `core/config/desktop-config.js`. |
| 11 | Reduced motion on every device | All content visible. Lenis smoothing off (`respectReducedMotion: true`). No parallax, scrub, camera move, autoplay, or canvas loop. Opacity under 200 ms may stay (a heuristic, not a WCAG number). The 3D still is the same camera and grade. A phone width is not reduced motion. | A reduced-motion project on each device. Every section's text is present, and the loop does not start. | `240r-devices-and-polish.md` section 5. https://github.com/darkroomengineering/lenis, WCAG 2.2.2 and 2.3.3 understanding pages. |
| 12 | Preloader handoff, and nav and footer craft | Preloader: fixed overlay, poster already at final size, progress from `LoadingManager` and `document.fonts.ready`, lift on first frame or an 8 second timeout, skip on a same-tab return. Nav: disclosure pattern, not `role="menu"`, keyboard and 44px targets. Footer: a designed last scene, credits, contrast, safe area, no hover-only columns. | A WebGL fixture has no CLS from the overlay and no blank first frame. A keyboard test opens and escapes the menu. The footer links are reachable and credited. | `240r-devices-and-polish.md` sections 6 and 7. https://threejs.org/docs/#api/en/loaders/managers/LoadingManager, https://web.dev/articles/optimize-cls, https://www.awwwards.com/about-evaluation/, https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/. |
| 13 | Palette proportion and imagery grade | Optional 60/30/10 check on the brand colors (dominant, secondary, accent). Imagery grade is consistent across the page, and every image is credited. Fake numbers and stock laptop people stay on the vision blacklist. | A fixture whose accent covers half the page flags the proportion. A fixture image missing from `CREDITS.json` fails `licenses.ts`. | Audit item 13. Harness ideas 3 and 12. Token contrast floors already in `packages/engine/src/brand/tokens.ts`. |

## Proposed 241 specs

Nine specs. Each is a build prompt later. This note does not write them and does not change product code.

| Spec | File to write later | Covers |
| --- | --- | --- |
| 241a | `241a-type-and-fonts.md` | Audit 1, 2, 3, 4. Harness idea 27. |
| 241b | `241b-device-matrix-and-mobile-polish.md` | Audit 7, 8, 11. Harness idea 24. |
| 241c | `241c-webgl-adaptive-and-preloader.md` | Audit 9. Audit 12, preloader half. Harness ideas 23 and 34. |
| 241d | `241d-lighthouse-nav-footer-palette.md` | Audit 10. Audit 12, nav and footer half. Audit 13, palette half. Harness idea 20. |
| 241e | `241e-beauty-recipe-vision.md` | Audit 5 and 6. |
| 241f | `241f-plan-directions-ingredients.md` | Harness ideas 1, 2, 3, 4, 5. |
| 241g | `241g-rubric-designmd-motion-frames.md` | Harness ideas 6, 7, 8, 9, 10, 29. |
| 241h | `241h-edits-imagery-variants-launch.md` | Audit 13, imagery half. Harness ideas 11, 12, 13, 19, 21, 22, 25, 26. |
| 241i | `241i-systems-decisions-deterministic.md` | Harness ideas 28, 31, 32, 33. |

Audit 11's 3D still is specified in the devices note and implemented with the reduced-motion project in 241b. 241c's tier-0 path is that same still. The two specs share the still. They do not split the requirement into a gap.

## Coverage

Every audit item and every harness idea scored 7 or higher appears once in the "primary" column. A second spec is named only where the work is deliberately shared, so a reader can see it was not dropped.

| Item | Primary spec | Also named in |
| --- | --- | --- |
| Audit 1 Font policy | 241a | 241f idea 3 runs the same names as chrome tells |
| Audit 2 Type gate | 241a | |
| Audit 3 License check | 241a | 241h idea 12 uses the same `CREDITS.json` for images |
| Audit 4 Type scale | 241a | |
| Audit 5 Beauty and recipe wired | 241e | |
| Audit 6 Vision font and Prompt 23 booleans | 241e | 241f idea 3 |
| Audit 7 Device matrix | 241b | |
| Audit 8 Mobile checks | 241b | |
| Audit 9 WebGL robustness | 241c | |
| Audit 10 Lighthouse per device | 241d | |
| Audit 11 Reduced motion | 241b | 241c tier-0 still |
| Audit 12 Preloader | 241c | |
| Audit 12 Nav and footer | 241d | |
| Audit 13 Palette proportion | 241d | |
| Audit 13 Imagery grade | 241h | |
| Idea 1 Plan-then-critique-the-plan before code (9) | 241f | |
| Idea 2 Screenshot fix loop: top 3 issues × max 3 rounds at 3 widths (9) | 241f | |
| Idea 3 Codified AI-cluster blacklist as a gate (9) | 241f | |
| Idea 4 Direction dealing: 3 of N researched directions from real SOTD study (8) | 241f | |
| Idea 5 Ingredients-first @ references to library sections and templates as code context (9) | 241f | 241i idea 32 renders what this references |
| Idea 6 Awwwards 40/30/20/10 rubric inside the beauty gate (8) | 241g | 241d idea 20 fills the four scores |
| Idea 7 Sitemap → section wireframe → style guide staging with approval (7) | 241g | |
| Idea 8 DESIGN.md lint to the Google spec (7) | 241g | |
| Idea 9 "One bold thing" and one orchestrated motion moment rule in motion.ts (8) | 241g | |
| Idea 10 Frame checks: title above the fold, equal margins, no dead blank stretches (8) | 241g | |
| Idea 11 Section-scoped edits plus lock/target to stop regressions (7) | 241h | 241i idea 33 is the prompt sentence |
| Idea 12 Real credited imagery and footage sourcing (7) | 241h | |
| Idea 13 Redesign order: type → color → frame → states → components, with before/after (7) | 241h | |
| Idea 19 Parallel variants and combine (8) | 241h | |
| Idea 20 Measured real-browser self-score per Awwwards criterion plus top-3 fixes (9) | 241d | |
| Idea 21 "Give no juror a reason to mark you down" floor checklist (7) | 241h | |
| Idea 22 Phase-gated reference loading (7) | 241h | |
| Idea 23 Phone performance budget written into the brief before any 3D (8) | 241c | |
| Idea 24 Device/browser matrix with iOS Safari as P0, plus a full state sweep (8) | 241b | |
| Idea 25 Yes/no launch checklist run twice: staging, then the live domain within an hour (7) | 241h | |
| Idea 26 Severity-graded defect log with regression retest after each Elevate pass (7) | 241h | |
| Idea 27 Mood adjectives → palette and type in the interview (7) | 241a | |
| Idea 28 Extract a design system from a reference URL (8) | 241i | |
| Idea 29 DESIGN.md → Tailwind v4 / DTCG export via @google/design.md CLI, with lint as a gate (8) | 241g | |
| Idea 31 Persistent decision canvas that keeps rejected directions (7) | 241i | |
| Idea 32 Deterministic section rendering instead of LLM-written markup for library components (7) | 241i | |
| Idea 33 Re-implement-without-regression prompt template (7) | 241i | |
| Idea 34 DOM-synced WebGL layer with teardown and GPU budget as a reusable recipe (7) | 241c | |

Count check: audit rows 1 through 13 are all present (item 12 and item 13 each appear as two rows because each has two halves). Harness ideas present: 1–13, 19, 20–29, 31–34. That is 28 ideas. Excluded, scored under 7, and absent on purpose: 14, 15, 16, 17, 18, 30, 35, 36, 37.

## Verification notes

- Font appendix: JSON in `240r-fonts.md`, parsed as part of finishing this note.
- Claims that name a number from Lighthouse, Playwright, detect-gpu, Lenis, or web.dev point at a page that was opened, or at the descriptor file downloaded from Playwright commit `e4af1585`. Pages that were linked from memory and not re-read line by line are marked in the devices note.
- `desktopDense4G`'s numeric fields were not copied. The desktop preset's wiring was read (`core/config/desktop-config.js`). 241d should print the numbers from the installed Lighthouse.
- No font files were downloaded. No product code, tests, prompts, or config were changed.
- Utopia (https://utopia.fyi) was not opened. The type-scale ratios use the modular-scale names (perfect fourth, augmented fourth, major third, perfect fifth, minor third). They are not a claim that a Utopia formula was copied.
