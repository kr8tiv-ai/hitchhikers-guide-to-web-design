# HH desk quality-gap audit (read-only) — main @ f612d0cd
Date: 2026-10-19 (Costa Rica time). Source: fresh clone at /workspace/hhg (detached at f612d0cd). Matt's PC worktree and running build were not touched.
Standards read: antihero-website-masterclass.pdf, website-on-autopilot.pdf (it's in Documents\antihero-review\pdfs, not new-pdfs), website-3d-masterclass.pdf (copied from Matt's PC, run through pdftotext), Desktop\hh-visual-research\RESEARCH.md + HIGH-END-TECHNIQUES-CONVERSATION, context/research/03-awwwards-anatomy.md, 04-motion-taxonomy.md, packages/knowledge/packs/anti-slop/SKILL.md.

## Short answer
No. Nothing in the desk guarantees a beautiful, modern font pairing, and it does not check every part of Matt's standards. Typography is guidance only, except for one heading letter-spacing probe. The only thing that blocks slop is a vision model's judgment plus a text/CSS linter that has no font rules. Two of the newest gates (the 239a beauty gate and the 240b recipe checker) exist and have tests, but no runner calls them yet. 240c plans to wire them (checkpoint item 4).

## 1. Inventory of gates
| Gate | File / function | What it really checks | Wired into a runner? |
|---|---|---|---|
| Anti-slop linter | packages/qa/src/antislop.ts `lintSlop` | banned words/phrases (engine voice list), "learn more/get started", em dash, "!", lorem, TODO, emoji headings, indigo/Tailwind palette, mx-auto+text-center container, purple & rainbow gradients, magnetic+pointer | Yes (verdict.ts, elevate.ts, zaphod-vision.ts, copy-refine.ts, cli improve/evaluate.ts). **No font rules.** |
| Beauty gate (239a) | qa/src/beauty-gate.ts `judgeBeauty/applyBeautyRound`, zaphod-vision.ts `zaphodReviewSections` | per-section vision score ≥ 8/10 (BEAUTY_MIN), textOnly/TODO/placeholder image, model-reported "slop" string; 3 rounds max | **Not called outside its own module** (rg finds no caller). |
| Zaphod vision review | qa/src/zaphod-vision.ts | 8 pillars (copy, visuals, color, **type**, spacing, experience, motion, brand) PASS/FIX/BLOCKER + jury numbers. All of it is model judgment. | Yes (elevate/verdict) |
| Jury | qa/src/jury.ts | weighted brand/craft/clarity/performance, pass at 70 | Yes |
| Recipe checker (240b) | qa/src/recipe-check.ts `checkRecipes/checkRecipeDir` | static: two-scroll-owners, lenis-ticker, layout-properties tweens, refresh-after-media (document.fonts/images), horizontal-ease, scrollto-with-lenis, reduced-motion, webgl-context | **Exported from qa/src/index.ts only. No runner calls it.** |
| Detail pass | qa/src/detail-pass.ts `detailChecks` | at 1440x900 only: h1 letter-spacing ≠ default ("kerning"), h1 not centered ("optical-alignment"), hover, focus, favicon, og:image, empty/error state, print, 404 | Yes (cli/commands/elevate.ts) |
| Lighthouse | qa/src/lighthouse-gate.ts `evaluateLh`, lhci-run.ts | **mobile only**: perf/a11y/best-practices/SEO ≥ 90, median of 3 runs. Desktop is reported and never gates. No LCP/CLS/INP assertions (rg finds none). | Yes (elevate-run.ts) |
| a11y | a11y-gate.ts / axe-run.ts | axe; moderate, serious and critical all block | Yes |
| Weight / structure | weight-gate.ts `evaluatePage` | title, h1 count, text ≥ 40 chars, broken hrefs, total page bytes by appetite band (500 KB to 8 MB). No per-asset 3D/video budget. | Yes (site-once-over.ts) |
| Console / links / secrets / licenses | console-gate.ts, link-check.ts, secrets.ts, licenses.ts | errors, 404s, keys, code-dependency licenses (licenses.ts has no font logic) | Yes |
| Screenshots | screenshots.ts `REVIEW_WIDTHS` = 375, 768, 1440, 1920; playwright-opener.ts `captureReviewShots` | Chromium only, plain setViewportSize (height 812 or 900), scroll strips at 1440 only | Yes (elevate-loop) |
| Elevate loop | qa/src/elevate-loop.ts `elevateRound` | passes motion, imagery, copy, standout. Refuses a pick on an LH/a11y/console/links/weight BLOCKER. Golden elevate-type.md exists as a prompt. | Yes (cli elevate) |
| Visual benchmark | qa/src/visual-bench.ts, bench/visual/run.ts | rubric lines incl. "typography" and originality are model/fixture scores; `isTemplateClone`, `deskPagesDiffer`. Not part of CI. | Manual (`bench --run`) |
| Template QA spec | templates/*/tests/qa.spec.ts | console/failed requests, screenshots at 375/768/1440 (height 900), h1 visible under reduced motion at 375 | Ships with the site |
| 240c (planned, prompt only) | hh-build-plan/prompts/240c-awwwards-gates-script-stubs.md | item 1: Awwwards-style pattern-usage scoring (pin/scrub density, materials, post, text reveals, camera, reduced-motion) + vision (design/usability/creativity/content). Item 2: LH mobile ≥ 90, **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1**, one WebGL context, 3D/video weight budgets, mobile stills fallback, reduced-motion complete. Item 4: checkpoint that "the recipe checker and gates run in the jury". **No typography, font, device or nav/footer items.** | n/a |

## 2. Fonts, exactly
- Font choice: engine/src/brand/tokens.ts `TYPE_PAIRINGS` has six fixed pairs: Bebas Neue/Barlow, **Space Grotesk/Inter**, DM Serif Display/DM Sans, Fraunces/Work Sans, Archivo Black/Archivo, Clash Display/Satoshi. A regex `MOODS` maps the DP-1.5 answer to a pair. With no mood match, `moodIndex` returns index 0 (Bebas/Barlow). A font the user names is accepted with warnings. There is **no ban list** for Inter, Poppins, Roboto, Montserrat, Open Sans and the like. Inter is one of the curated defaults.
- `TYPE_LICENSE` is only a string ("Google Fonts or Fontshare. Confirm the license at install."). site-rules.ts says font files may be OFL-1.1. **No code verifies a font's license** (licenses.ts never mentions fonts). The CREDITS.json font entry is prompt-only (packs/typography/SKILL.md, golden/credits.md).
- packs/typography/SKILL.md, prompt-only: at most two families, body ≥ 16px, line-height 1.4–1.6, 45–75 characters per line, clamp() fluid type, check at 375/390/430, self-hosted woff2, font-display swap/optional, preload the headline face, subset. "Inter … is not the default for a brand that did not choose it" is guidance, not a check.
- language-pack/typography.md: clamp example plus a "size-adjusted fallback" (prompt-only).
- DESIGN.md (engine/src/spec/design-outputs.ts): writes a **fixed, brief-independent type scale** (display 4.75rem/0.95/-0.03em … caption 0.875rem). The font families are not written into DESIGN.md (rg finds no family/font in that file). The type-voice text comes from art-direction.ts `typeVoiceFor` (e.g. "A large serif display scale … yours to set").
- Golden fonts.md asks the builder to "confirm the computed family matches the font-face rule". That is a prompt step, not a desk gate.
- Automated font checks that exist: detail-pass `measureType` (h1 letter-spacing > 0.2px, h1 not centered), recipe-check refresh-after-media (wants `document.fonts.ready`), and the vision "type" pillar / bench "typography" line (model opinion).
- **Missing:** a banned or overused-default font list, pairing-quality rules (contrast of classification, x-height or proportion match), a family-count check on the built CSS, computed font-family vs brand, fallback-stack detection (FOUT or system font actually rendering), variable-font or optical-size use, font-display/preload/subset verification, font byte budget, license verification, and a type-scale ratio or display-to-body contrast check (Matt's No Slop Prompt 23 asks for "big contrast between display and body"). Body min size, line-height and measure are also unchecked.

## 3. Standards matrix (E = enforced by code, P = prompt/guidance only, M = missing, V = vision-model judgment only)
| Standard (source) | Status | Evidence |
|---|---|---|
| Two fonts max, display + body (masterclass step 4; autopilot "Two fonts, max") | P | packs/typography/SKILL.md; golden/fonts.md |
| Modern pairing / no AI-default fonts | M (Inter is a default) | tokens.ts TYPE_PAIRINGS; nothing in antislop.ts |
| Brand fonts only ("brand colors and fonts only", Prompt 23) | P / V | golden/section.md, detail-pass prompt "Do not add a font outside the brand" |
| Type scale with big display/body contrast (Prompt 23; 03-anatomy "typography as image") | P (fixed scale) / V | design-outputs.ts fixed scale; zaphod "type" pillar |
| Tracking / optical alignment | E (h1 only, 1440 only) | detail-pass.ts measureType |
| Body size, line-height, measure | P | typography SKILL.md |
| Font loading (woff2, preload, display, subset) | P | typography SKILL.md; autopilot Prompt 19 "Preload the two brand fonts" |
| Font licensing / credits | P | TYPE_LICENSE string; golden/credits.md |
| Spacing / grid / asymmetry ("asymmetric layouts with intentional empty space") | P / V | DESIGN.md space tokens; zaphod "spacing"; antislop centered-container only |
| Color: hex with a job, contrast, no indigo/purple | E (partly) | tokens.ts BODY_MIN 4.5 / LARGE_MIN 3 and DENY_HEX at kit time; antislop indigo/purple; axe contrast |
| 60/30/10 palette proportions (autopilot example) | M | — |
| Imagery / art direction, one consistent grade (autopilot Prompts 06–07 RULE) | V | beauty-gate textOnly/placeholder (not wired); art-direction.ts prompt |
| No stock "smiling people pointing at laptops" | V | vision slop string only |
| No 3 icon cards / blob hero / cloned rhythm (Prompt 23) | V | anti-slop SKILL says "visual checks" → vision only; visual-bench isTemplateClone |
| One bold idea / signature moment per section (03-anatomy #1, autopilot Q8) | V / planned | 240c item 1 |
| Motion: transform/opacity only, one scroll owner, Lenis+ticker, refresh after fonts | E-in-code, not wired | recipe-check.ts (no caller) |
| Motion taxonomy A–H use / pattern density | M → planned 240c item 1 | 04-motion-taxonomy.md |
| Reduced motion | E (weak) + recipe | template qa.spec (h1 visible at 375); recipe-check reduced-motion (not wired); 240c item 2 planned |
| 3D/WebGL: one renderer, DPR ≤ 2, pause offscreen, Draco/Meshopt, GLB size (3D masterclass Step 13, Prompt 07) | partial | recipe-check webgl-context (not wired); templates/shared/webgl.ts fallback heuristic; DPR/pause/GLB size missing; 240c plans one-context + 3D budgets |
| Micro-interactions: hover, focus, tap feedback (D4/D5) | E (presence) | detail-pass hover/focus at 1440 |
| No magnetic buttons; no custom cursor on touch | E / M | antislop magnetic; cursor-on-touch unchecked |
| Copy quality: banned words, no lorem, no fake testimonials/numbers | E (words) / V (fakes) | antislop + copy-refine; fake logos/numbers vision only |
| Preloader → intro handoff for WebGL heroes (03-anatomy #4, taxonomy C4) | M | — |
| Page transitions (C1/C2) | M | — |
| Navigation: menu keyboard open/close, focus trap, Escape (autopilot Prompt 11/21) | P (+ desk e2e only for the app itself) | autopilot Prompt 21; no gate on generated sites |
| Footer craft, credits link in footer (Prompt 20; anatomy #9) | P | golden/credits.md |
| 404, favicon, og:image, print, empty/error states | E | detail-pass.ts |
| Accessibility | E | axe-run/a11y-gate; LH a11y ≥ 90 mobile |
| Alt text on every image (Prompt 21) | E via axe | — |
| Performance: LH mobile ≥ 90 | E | lighthouse-gate.ts / lhci-run.ts |
| LCP/INP/CLS thresholds | M → planned 240c item 2 | — |
| Page weight | E (total bytes) | weight-gate.ts; per-asset 3D/video budget planned 240c |
| Ambient sound off by default (H3) | P | taxonomy H3; mc prompt |
| Originality vs template clone | E (bench) / V | visual-bench isTemplateClone, deskPagesDiffer (bench only, not CI) |
| SEO (title, h1, crawlable text) | E | weight-gate.ts; LH SEO |

## 4. Device coverage (parent addendum)
| Item | Status | Evidence |
|---|---|---|
| Real mobile engines: iOS Safari/WebKit | M | only Chromium: playwright-opener `withChromium`; app playwright.config.ts projects=[chromium]; template qa.spec defaults to Chromium |
| Android Chrome emulation (isMobile, hasTouch, DPR, UA) | M | widths set with setViewportSize only; no `devices[...]`, isMobile, hasTouch or deviceScaleFactor anywhere in packages (rg) |
| Phone width | E (screenshot + vision) | REVIEW_WIDTHS 375; template 375 |
| 390/430 phone widths (typography SKILL) | P | not in REVIEW_WIDTHS |
| Tablet portrait (iPad 768x1024 etc.) | partial | 768 wide at height 900 only, Chromium |
| Tablet landscape / phone landscape / Android tablets | M | — |
| Desktop 1440/1920 | E | REVIEW_WIDTHS |
| Detail checks across devices | M (1440 only) | detail-pass.ts viewport 1440x900 |
| Motion scroll strips across devices | M (1440 only) | captureReviewShots |
| Touch vs hover (no hover-only content, pointer:coarse, no cursor on touch, 44px targets) | P | a11y SKILL 44px; anti-slop cursor-on-touch; motion-previews uses pointer:coarse in the desk app, not a site gate |
| Safe areas / notch (env(safe-area-inset-*), viewport-fit=cover) | M | rg finds nothing |
| 100vh vs 100dvh/svh (iOS URL bar) | M | rg finds nothing; golden/hero.md says "Full viewport height" |
| WebGL fallback on low-end GPU / no WebGL / context loss | partial (code heuristic, untested on device) | templates/shared/webgl.ts: still if reducedMotion, width ≤ 430, saveData, or cores ≤ 4. No GPU-tier, failIfMajorPerformanceCaveat or context-loss test |
| Reduced motion | E (weak) | template qa.spec h1 visible; recipe rule not wired; 240c planned |
| iOS video autoplay: muted + playsinline + poster, mobile gets the poster (autopilot Prompt 19, taxonomy H1) | P | no check in qa (rg playsinline = 0 in qa/src) |
| Per-device Lighthouse | partial | mobile preset only gates; desktop reported, never gates; no tablet; no real-device or WebPageTest |
| Matt's "check on your actual phone, iPhone and Android" (3D Prompt 08, masterclass step 5) | P (manual) | — |

## 5. Recommended 241 spec items
1. Font policy in code: an `OVERUSED_DEFAULTS` list (Inter, Poppins, Roboto, Open Sans, Montserrat, Lato, Arial/Helvetica/system-ui as the display face) used by tokens.ts and as a new antislop/site rule on built CSS. Allowed only when the user named it in DP-1.5. Remove Inter from the default TYPE_PAIRINGS or make it user-only. Expand the curated pairings by style world (editorial, 3d-world, playful, brutalist), each pair tagged with classification contrast and source/license.
2. Built-site type gate (Playwright, computed styles): count families on visible text ≤ 2 (one family in two weights counts as one); computed family = brand families (no fallback rendering, `document.fonts.check`); display:body size ratio ≥ a threshold at 375 and 1440; body ≥ 16px; line-height 1.4–1.6; measure 45–75ch; woff2 self-hosted, font-display swap/optional, headline face preloaded; font byte budget.
3. Font license check: CREDITS.json has every shipped family, and each is OFL or Fontshare with its `license_type` recorded. Extend licenses.ts.
4. Type scale derived from the brief (ratio by world/appetite) instead of the fixed design-outputs.ts constants. Write the chosen families into DESIGN.md.
5. Wire the beauty gate and recipe checker into elevate/verdict/jury (overlaps 240c item 4, but make it a test: the runner calls `judgeBeauty` and `checkRecipeDir`).
6. Vision rubric gets explicit font items: "generic/AI-default type", "weak display/body contrast", plus the Prompt 23 visual bans as separate booleans (blob hero, 3 icon cards, cloned rhythm, stock laptop people, fake logos/testimonials/numbers).
7. Device matrix: Playwright projects for WebKit iPhone (e.g. iPhone 15), Chromium Pixel 7, iPad portrait and landscape, an Android tablet, and desktop 1440/1920, with isMobile/hasTouch/DPR. Add 390 and 430 widths. Run screenshots, detail checks and scroll strips per project.
8. Mobile-specific checks: no horizontal overflow; hero uses dvh/svh, not bare 100vh; safe-area insets when fixed or sticky UI touches the edges; tap targets ≥ 44px; no hover-only content and no custom cursor under pointer:coarse; videos carry muted, playsinline and a poster, and the poster-only path is used on mobile/save-data; menu keyboard open/close/Escape/focus trap.
9. WebGL robustness: test the no-WebGL and context-loss paths (fallback still renders), DPR ≤ 2, rendering pauses offscreen or on hidden tabs, GLB Draco/Meshopt with a size budget (masterclass: 44 MB strawberry).
10. Lighthouse per device: mobile gate as today plus a desktop floor and a tablet run, with LCP/INP/CLS thresholds (overlaps 240c item 2).
11. Reduced-motion full pass at every device: all content visible, Lenis off, 3D replaced with a still.
12. Preloader → intro handoff required when a WebGL hero ships. Page transitions and footer/nav craft added as rubric lines.
13. 60/30/10 palette proportion check (optional) and an imagery grade-consistency rubric line.
Keep the 240c library-freedom rule: these measure outcomes and never ban a library.
