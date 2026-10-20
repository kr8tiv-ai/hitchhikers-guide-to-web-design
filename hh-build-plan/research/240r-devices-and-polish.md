# 240r. Devices, mobile polish, WebGL that stays, Lighthouse, reduced motion, preloader, nav and footer

Date: 2026-10-19. Research only. This note is the input for the 241 specs. It does not change product code.

The desk's job is a site that is stunning on the phone the visitor actually holds. The current shared helper does the opposite of that. `shouldUsePoster` in `packages/templates/shared/webgl.ts` returns true when `viewportWidth <= 430`, or `saveData`, or `cores <= 4`, or reduced motion. A modern phone is then a poster. That width cutoff is the anti-pattern this note replaces.

The replacement is adaptive quality. A capable phone still runs the scene: a capped device-pixel ratio, a shorter post chain, compressed textures and meshes, level of detail, and a poster that is the Largest Contentful Paint image and the recovery still. The poster is not the default phone experience. Stripping the effect because the CSS width is under 430 is not a recommendation anywhere below.

Measure outcomes. Do not ban a library. Lenis, GSAP, Three, OGL, and postprocessing stay. The gates check what the visitor gets.

The high-end techniques transcript (`hh-build-plan/research/high-end-techniques-transcript-2026-10-19.md`) is a language pack, not a mobile budget. Its bloom range (strength 0.3–0.8, radius 0.4, threshold 0.85), camera lerp, and `scrub: 1` are desktop starting points. On a phone, start at the low end of each range and let the tier table below cut the expensive passes. `matchMedia` for reduced motion is in that transcript. A width matchMedia that turns the scene off is not.

## 1. Device matrix

Playwright's device list is the source of viewport numbers. This pass downloaded `deviceDescriptorsSource.json` at commit `e4af1585fcfa98f475e1702b2f98e04026cae4c2` (20 Nov 2025, 143 devices, 52.9 KB):

https://github.com/microsoft/playwright/blob/e4af1585fcfa98f475e1702b2f98e04026cae4c2/packages/playwright-core/src/server/deviceDescriptorsSource.json

The raw `main` URL 404'd on 2026-10-19, so the path can move. The 241 spec must read `devices` from the Playwright version this repo installs, spread the descriptor, and fail setup if the key is missing. Do not copy a blog's CSS-pixel table into the test. Playwright's own docs show the pattern (`...devices['iPhone 13']`) at https://playwright.dev/docs/emulation (docs source: https://github.com/microsoft/playwright/blob/main/docs/src/emulation.md).

Numbers below are from that commit's file, not from a secondary table. Playwright viewports are the layout viewport (browser chrome already subtracted). That is why "iPhone 15" is 393×659 here and 393×852 in hardware spec sheets. Both can be true. The test uses the descriptor.

| Project | Key to spread | Browser | Viewport | DPR | isMobile | hasTouch |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone portrait | `iPhone 15` | webkit | 393×659 | 3 | true | true |
| iPhone landscape | `iPhone 15 landscape` | webkit | 734×343 | 3 | true | true |
| Android phone | `Pixel 7` | chromium | 412×839 | 2.625 | true | true |
| Android phone landscape | `Pixel 7 landscape` | chromium | 863×360 | 2.625 | true | true |
| iPad portrait | `iPad Pro 11` | webkit | 834×1194 | 2 | true | true |
| iPad landscape | `iPad Pro 11 landscape` | webkit | 1194×834 | 2 | true | true |
| Android tablet | `Galaxy Tab S9` | chromium | 640×1024 | 2.5 | true | true |
| Android tablet landscape | `Galaxy Tab S9 landscape` | chromium | 1024×640 | 2.5 | true | true |
| Desktop | `Desktop Chrome` plus a 1440 and a 1920 context | chromium | descriptor is 1280×720, DPR 1 | 1 | false | false |

`Galaxy Tab S4` is also in that file (712×1138, DPR 2.25, chromium). Prefer `Galaxy Tab S9` as the Android tablet. Keep S4 only if the installed Playwright dropped S9.

Extra screenshot widths, on top of the device projects: 390 and 430, which the audit asked for, plus the existing `REVIEW_WIDTHS` in `packages/qa/src/screenshots.ts` (375, 768, 1440, 1920). 390 is the iPhone 12–14 CSS width class. 430 is the iPhone 14 Pro Max / 15 Plus class. They are width checks, not a reason to disable WebGL.

Desktop at 1440 and 1920 is a custom context: `viewport: { width, height: 900 }`, `deviceScaleFactor: 1`, `isMobile: false`, `hasTouch: false`, `defaultBrowserType: 'chromium'`. Do not pretend those two widths are keys in the descriptor file.

What emulation catches: user agent, viewport, device scale factor, `isMobile`, `hasTouch`, and the layout that follows. Run screenshots, the detail pass, scroll strips, the menu keyboard pass, and the reduced-motion pass in each project. `packages/qa/src/playwright-opener.ts` is Chromium-only today (`withChromium`). The matrix needs a WebKit project. WebKit is the P0 phone, because that is the browser the audit and harness idea 24 both name.

What emulation misses, and must be said in the spec so nobody treats a green CI run as a real iPhone:

- WebGL runs on the host GPU, or on SwiftShader in headless. A tier measured in CI is not the phone's tier. Do not assert a GPU tier inside the emulated project. Assert that the page *asks* for a tier and that the tier table is wired. Measure the tier on an optional real device.
- Playwright WebKit is not iOS Safari. The compositor, the URL-bar resize, the video media pipeline, and the font rasteriser differ. Dynamic viewport units can be polyfilled or ignored. Confirm `svh`/`dvh` support in the installed WebKit rather than assuming the desktop build matches iOS.
- `env(safe-area-inset-*)` is not in the device descriptor. A test that expects 47px of padding will flake. Assert that fixed and sticky bars use `env(safe-area-inset-*)` in the stylesheet, and inject a known inset only in a dedicated test.
- Video autoplay policy in headless does not match iOS. Assert the attributes (`muted`, `playsinline`, `poster`). Do not assert that the video element reached `playing` under WebKit emulation.
- Memory, thermals, and driver bugs are invisible. Idea 37 in the harness study (a physical lab down to an iPhone-6-class phone) scored 6 and stays out of the build. The practical substitute is the tier-1 profile below, plus an optional real-device run.

Optional real devices, not a gate: BrowserStack and LambdaTest for a real iOS Safari and a real Android Chrome pass before a public launch. WebPageTest for packet-level throttling when a lab Lighthouse score and a field complaint disagree (Lighthouse's own throttling doc says simulated throttling is the default and that a deep investigation should use packet-level shaping: https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md). No prices are recorded here. None of these services is required for the desk to ship a site.

## 2. Mobile and Android polish

These are checks, with the CSS the built site should contain.

**Hero height.** Do not size a hero with bare `100vh` only. `svh` is the small viewport (URL bar visible). `lvh` is the large viewport (URL bar hidden). `dvh` tracks the current viewport and can jump as the Android Chrome bar shows and hides. Use `min-height: 100svh` so the hero fits while the bar is visible, and add `min-height: 100dvh` only on a full-bleed hero where a small jump is acceptable. Keep a `100vh` fallback before the new units for old browsers. Spec: https://drafts.csswg.org/css-values-4/#viewport-relative-lengths (CSS Values 4). MDN reference: https://developer.mozilla.org/en-US/docs/Web/CSS/length (not re-read line by line this pass; the unit names and the jump behaviour of `dvh` are the point).

**Safe area.** `viewport-fit=cover` on the viewport meta, then pad fixed and sticky UI with `env(safe-area-inset-top)`, `right`, `bottom`, and `left`. Apple's write-up is https://webkit.org/blog/7929/designing-websites-for-iphone-x/ (the pattern; the page was not re-opened line by line this pass). The footer and the menu button need the bottom and top insets. A full-bleed hero may bleed into the inset. Text and controls may not.

**Android keyboard.** `interactive-widget=resizes-content` on the viewport meta is the candidate so a focused field is not covered. This pass did not open a browser test of that token. Mark it unverified until 241b checks it on the Pixel 7 project. Do not block the rest of the polish on it.

**Tap targets.** WCAG 2.2 success criterion 2.5.8 Target Size (Minimum), Level AA, is 24 by 24 CSS pixels. Success criterion 2.5.5 Target Size (Enhanced), Level AAA, is 44 by 44 CSS pixels. Understanding docs: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html and https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html (criteria as published; pages not re-opened line by line this pass). The audit asks for at least 44. Use 44 for primary controls: menu, nav items, footer links that are buttons, hero calls to action, form submits. Use 24 as the AA floor only for inline text links that already have spacing around them. Measure with `getBoundingClientRect` in each device project.

**Hover versus touch.** Style hover decoration inside `@media (hover: hover) and (pointer: fine)`. Under `@media (pointer: coarse)`, do not hide content that only appears on hover, and do not show a custom cursor. The same information must be available on tap. Confirm the emulated project actually matches `(pointer: coarse)` in the installed Playwright. If it does not, set the media feature in that project's context or assert the CSS contains the query. Do not fail a real layout because the emulator's media feature is wrong. Record which one happened.

**Video autoplay.** iOS requires a muted inline video. WebKit's policy note: https://webkit.org/blog/6784/new-video-policies-for-ios/. Chrome's autoplay rules: https://developer.chrome.com/blog/autoplay/ (both are the policy pages; not re-opened line by line this pass). Ship `muted`, `playsinline`, and a `poster`. The poster is designed at the same grade as the film, so a blocked autoplay still looks art-directed. Play the file when autoplay is allowed and `saveData` is false. When autoplay is blocked, keep the poster and a control. Do not omit the video on a phone as the default.

**URL bar and overscroll.** The `svh` rule above is the URL-bar fix. Leave native overscroll on (pull-to-refresh, the bar showing). Set `overscroll-behavior: none` on the scroll root only when Lenis `syncTouch` is actually on. Lenis's own `overscroll` option defaults to `true` and points at the CSS property: https://github.com/darkroomengineering/lenis (README settings table, read this pass).

**Scroll and Lenis.** Current README defaults, package `lenis`, script tag on the README was `1.3.27`: `smoothWheel` true, `syncTouch` false ("can be unstable on iOS<16"), `syncTouchLerp` 0.075, `touchInertiaExponent` 1.7, `touchMultiplier` 1, `respectReducedMotion` true, `lerp` 0.1. License: https://github.com/darkroomengineering/lenis/blob/main/LICENSE (MIT; the license file was listed, not re-read word for word).

On `(pointer: fine)`, smooth the wheel. On `(pointer: coarse)`, keep native scroll (`syncTouch: false`) and still scrub the same ScrollTrigger animations off that native scroll. Turn `syncTouch` on only when all of these are true: GPU tier is 2 or 3, reduced motion is off, and the UA is not iOS below 16. Infinite scroll, if a page uses it, requires `syncTouch: true` on touch (Lenis README). Prefer `lenis.scrollTo` over ScrollToPlugin while Lenis is active (techniques transcript). Keep the existing recipe-check sync: `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add` calling `lenis.raf`, and `gsap.ticker.lagSmoothing(0)`.

`respectReducedMotion: true` makes smoothing and programmatic scrolls instant. That is the right default. Do not set it false to "keep the feel" for a visitor who asked for less motion.

**Text.** Do not set `-webkit-font-smoothing: antialiased` on the root (see `240r-fonts.md`). Set `text-size-adjust: 100%` so Android Chrome does not inflate the type the scale just set. Body stays at least 16px, line-height 1.45–1.6, measure 45–75ch, checked at 375, 390, 430, and 1440.

**Menus and focus.** The mobile nav is a disclosure, not an ARIA menu. Site navigation that opens a panel uses the disclosure pattern: https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/ (pattern page; not re-opened line by line this pass). `role="menu"` is for application menus and is the wrong role here. Required behaviour, tested with the keyboard in every project: open, close, Escape closes, focus moves into the panel and is trapped while it is open, focus returns to the button, the page behind is `inert` or `aria-hidden`, the current page has `aria-current="page"`, and a skip link is first. Targets inside the panel are at least 44px. The panel respects the safe area.

## 3. WebGL on mobile without losing the picture

The scene stays. The cost changes with the GPU.

**Tiering.** Use `@pmndrs/detect-gpu` (`getGPUTier`). The package moved off the old `detect-gpu` name. README read this pass: https://github.com/pmndrs/detect-gpu/blob/master/README.md. MIT: https://raw.githubusercontent.com/pmndrs/detect-gpu/master/LICENSE.

Defaults from that README: tier 0 if no WebGL, if the renderer is blocklisted, or if the benchmark is under 15 fps. Tier 1 is at least 15 fps, tier 2 at least 30, tier 3 at least 60. `mobileTiers` and `desktopTiers` default to `[0, 15, 30, 60]`. `type` is one of `BENCHMARK`, `FALLBACK`, `BENCHMARK_FETCH_FAILED`, `BLOCKLISTED`, `WEBGL_UNSUPPORTED`, `SSR`. `failIfMajorPerformanceCaveat` defaults to false. Set it true only when a software renderer should take the still path. Self-host the benchmark JSON (`benchmarksURL`). gfxbench.com stopped updating in December 2025 (README, issue 132). The data is still the right table for GPUs that exist. Do not depend on unpkg at runtime.

`hardwareConcurrency <= 4` is a weak signal. A phone can report 4 or 8 cores and still have a fast GPU, or the reverse. Do not let the core count alone select the poster. `saveData` lowers texture size and drops bloom. It selects the poster only when the tier is also 0.

**Suggested tier table** (a recommendation for 241c, not a number measured on a device farm):

| Tier | When | DPR cap | What still runs | What steps down |
| --- | --- | --- | --- | --- |
| 3 | fps ≥ 60, or a known high mobile GPU | `min(devicePixelRatio, 2)` | Full scene, instancing, grade, half-resolution bloom at the low end of the language pack (strength about 0.3, radius 0.4, threshold 0.85), light grain, LOD 0 | No SSAO. `antialias: false` stays (already in `getContext`). |
| 2 | fps ≥ 30 | 1.5 | Scene, instancing, grade, grain, LOD 1 | Bloom off, or at most a handful of samples. No SSAO. |
| 1 | fps ≥ 15, or `type: FALLBACK` | 1 | Scene silhouette, the same colour grade baked into the material or one pass, instancing, fewer lights, higher LOD | No composer. No bloom, no grain pass, no SSAO. |
| 0 | no WebGL, blocklisted, `failIfMajorPerformanceCaveat`, or context loss twice | n/a | An art-directed still of the same camera, grade, and lighting | The loop does not start. |

iPhone 15's descriptor DPR is 3. Rendering at 3× is nine times the CSS pixels. Cap at 2 even on tier 3. The drei pack already names `AdaptiveDpr` and `PerformanceMonitor` (`packages/knowledge/packs/drei/SKILL.md`). On a decline, step DPR down by 0.25, floor 1, and allow two flip-flops so quality does not oscillate. The exact default numbers inside the installed drei `PerformanceMonitor` were not read this pass. Confirm them in that package before hard-coding, and treat the 0.25 / floor 1 / two flip-flops as the desk's policy if the library defaults differ.

**Assets.** Keep the existing 5 MiB GLB budget in `packages/qa/src/performance-gate.ts` (`GLB_BUDGET_BYTES`). The audit's 44 MB strawberry is a warning, not a new budget. Compress:

- Textures: KTX2 with Basis Universal. ETC1S for colour, UASTC for normals. three.js `KTX2Loader`: https://threejs.org/docs/#examples/en/loaders/KTX2Loader (API page; not re-opened line by line this pass).
- Meshes: Meshopt (`MeshoptDecoder`) as the default on phones, because the decode is lighter than Draco. Draco (`DRACOLoader`) when the byte win matters and the decode can wait until after first paint. three.js docs: https://threejs.org/docs/#examples/en/loaders/DRACOLoader. The "Meshopt decodes more cheaply than Draco on mobile" line is a practitioner rule used by gltf-transform's meshopt path (https://gltf-transform.dev/modules/extensions/functions/meshopt). This pass did not re-benchmark it. Do not quote a percentage.
- Draw calls: `InstancedMesh` for repeated objects at every tier that runs the scene. Instancing is how the scene stays rich at DPR 1. It is not something to remove on mobile.

**Poster-first, then the scene.** The LCP element is a designed `<img>` of the hero frame: `fetchpriority="high"`, not lazy, in the DOM before the canvas, with explicit width and height so it does not shift. The canvas composites over it after the first rendered frame. That is how a WebGL hero can still chase a Lighthouse performance score of at least 90 on the phone preset. Award-studio mobile scores of 37–71 (DappaSol, Lighthouse 13.4.1, 4× CPU, 16 Sep 2026: Lusion 53, Locomotive 71, Active Theory 43, Basement 37; https://dappasol.com/guides/cinematic-website-examples/, cited in the harness study) show that a full realtime scene as the *initial* load will not clear this desk's phone floor. Defer the loop until the poster has painted. Do not delete the scene to buy the score.

**Pausing.** Keep `pauseOffscreen` (IntersectionObserver). Also pause on `document.visibilityState === 'hidden'`. Resume when both the canvas is intersecting and the tab is visible. `OffscreenCanvas` is not a requirement. iOS Safari support has been incomplete for the worker-backed path. Do not depend on it for the hero.

**Context loss.** Listen for `webglcontextlost`, call `preventDefault`, and rebuild on `webglcontextrestored`. After two failed restores, show the same art-directed still and stop. A blank canvas or a generic gradient is a failure. `getContext` already throws when WebGL2 is missing. Catch that and take the tier-0 still. One context per page stays (`claimCanvas` throws "one context per page").

**What changes in `shouldUsePoster`.** Replace the function. Poster (tier 0) when reduced motion is on, or WebGL is missing, or the tier is 0, or context loss has failed twice. `saveData` with tier ≥ 1 keeps the scene at tier-1 settings even if the benchmark said tier 2 or 3. Width and core count do not select the poster.

## 4. Lighthouse per device

Lab thresholds, from https://web.dev/articles/vitals (Philip Walton, updated 31 Oct 2024, read this pass): LCP within 2.5 seconds, INP within 200 milliseconds, CLS of 0.1 or less, at the 75th percentile, segmented by mobile and desktop. The same numbers are already constants in `packages/qa/src/performance-gate.ts` (`LCP_MAX_MS` 2500, `INP_MAX_MS` 200, `CLS_MAX` 0.1). Category floors stay at 90 (`packages/qa/src/lighthouse-gate.ts` and `packages/deploy/src/post-deploy-live.ts`). Do not lower them for phones.

Lighthouse measures LCP and CLS in the lab. It does not measure INP, because a lab load has no user input. Total Blocking Time is the lab proxy (same web.dev article: the INP cell for Lighthouse is "use TBT instead"). The current gate fails when INP is missing (`vitalReasons`). That will fail every honest lab run. 241d should gate LCP and CLS in the lab, treat TBT as the INP proxy, and fail on INP only when a scripted interaction actually produced a sample. A TBT of 200 ms is the lab stand-in aligned with the INP "good" threshold. Confirm the score curve in the installed Lighthouse (the repo's LHCI note says `@lhci/cli` 0.15.1 runs Lighthouse 12.6.1, in `packages/qa/src/lhci-run.ts`) rather than inventing a second cutoff.

**Mobile config.** Lighthouse default, read from `core/config/constants.js` on main this pass (https://raw.githubusercontent.com/GoogleChrome/lighthouse/main/core/config/constants.js):

- `formFactor: 'mobile'`
- Screen: `mobile: true`, width 412, height 823, `deviceScaleFactor: 1.75` (Moto G Power emulation)
- UA: `Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36`
- Throttling method: `simulate`
- Network, from https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md (read this pass): latency 150 ms, 1.6 Mbps down, 750 Kbps up, no packet loss. CPU slowdown multiplier default 4. The doc says this is roughly the bottom 25% of 4G and the top 25% of 3G, and that simulated throttling is the default because it is fast and stable.

`formFactor` must match `screenEmulation.mobile`. Lighthouse throws when they disagree (https://github.com/GoogleChrome/lighthouse/blob/main/docs/emulation.md, read this pass).

**Desktop config.** `--preset=desktop`, which `core/config/desktop-config.js` maps to `formFactor: 'desktop'`, `screenEmulation` 1350×940 at device scale factor 1, the desktop UA (`Macintosh; Intel Mac OS X 10_15_7`, Chrome/136), and `throttling.desktopDense4G`. The numeric fields inside `desktopDense4G` live in Lantern and were not copied this pass. 241d should print them from the installed Lighthouse rather than hard-code a blog. The old `--emulated-form-factor` flag was removed. Desktop is a gate, not a report-only number. Today `lighthouse-gate.ts` lets desktop miss the floor without changing status. 241d changes that: desktop performance, LCP, and CLS use the same floors, on the desktop preset (no 4× CPU).

**Tablet config.** There is no official tablet preset. `formFactor` is only `mobile` or `desktop`. Two honest options:

- Score as desktop (`formFactor: 'desktop'`, desktop throttling) with a tablet viewport around 820×1180 and device scale factor 2. This asks "does the tablet layout fail", without pretending the CPU is a phone.
- Score as mobile with that same viewport. This is harsher and will fail cinematic pages that the phone preset already covers.

Use the first for the tablet project. Keep the phone preset as the one that must clear 90. Record both form factor and viewport in the report so a failure is explainable. On a real device, set `screenEmulation.disabled` and `cpuSlowdownMultiplier` 1 (emulation.md).

**Field versus lab.** CrUX, PageSpeed Insights, and Search Console are field (75th percentile, mobile and desktop segments). A site that is not public has no CrUX. The desk gates on the lab. Do not block a launch on missing field data. Optional: a WebPageTest run when the lab score and a later field sample disagree.

**WebGL and LCP.** The poster image in section 3 is the LCP element. It is an `<img>`, discoverable in the HTML, with `fetchpriority="high"`, dimensions set, and not inside a late canvas draw. The GL loop starts after that image has painted (or after an 8 second timeout, section 6). Lighthouse's LCP audit then scores an image, which it knows how to score, while the scene still runs for the visitor.

## 5. Reduced motion, per technique

`prefers-reduced-motion: reduce` is a user setting. It is not a synonym for "phone". A phone with no reduced-motion preference gets the tier table. A desktop with the preference gets the still.

WCAG 2.2.2 Pause, Stop, Hide (Level A) and 2.3.3 Animation from Interactions (Level AAA) are the criteria behind this pass: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html and https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html (not re-opened line by line this pass). Lenis already honours the setting when `respectReducedMotion` is true.

Keep:

- Colour, type, and the layout.
- Opacity changes at or under 200 ms. That 200 ms figure is a studio heuristic lined up with the INP "good" threshold. It is not a WCAG number. Mark it as a heuristic.
- Focus rings, the skip link, and instant show/hide of the menu (no slide).
- A posed 3D still of the same camera, grade, and lighting. The three pack says reduced motion shows the poster and does not start the loop (`packages/knowledge/packs/three/SKILL.md`). The still must be art-directed, not a blank poster with a label.

Remove:

- Parallax and scroll-scrubbed large movement.
- Camera moves, autoplay video, marquees, and infinite loops.
- Lenis smoothing (native scroll, instant `scrollTo`).
- Page-transition slides. A cross-fade under 200 ms is the optional keep. A wipe is not.
- The canvas `requestAnimationFrame` loop.

Run this as a full pass on every device project, not only an `h1` visibility check at 375. Every section's text and image is present. Pinned sections unpin. No element depends on a scroll animation to become visible.

## 6. Preloader to intro

No specific Site of the Day URL was opened for this section. Do not invent a studio recipe. The pattern below is the one that satisfies the gates we already have.

- The hero, including the poster image, is in the document at its final size before the overlay lifts. The overlay is `position: fixed` and does not push layout. CLS stays under 0.1 (https://web.dev/articles/optimize-cls).
- Progress comes from `THREE.LoadingManager` (https://threejs.org/docs/#api/en/loaders/managers/LoadingManager), plus `document.fonts.ready`. A fake timer is not progress.
- Lift the overlay on the first of: fonts ready and the first rendered frame, or an 8 second timeout. The timeout is a desk rule so a missing asset cannot trap the visitor. On timeout, leave the poster up and let the scene continue in the background if the tier allows.
- Do not animate the overlay out with a layout-affecting property. Opacity only.
- Skip the preloader on a return visit in the same tab (`sessionStorage`). The first view is the show. The second view is the site.
- Reduced motion: no intro camera move. Show the still, then the page, with an opacity handoff under the 200 ms heuristic.
- `ScrollTrigger.refresh()` after fonts and after the overlay lifts (techniques transcript; also the existing recipe-check rule that waits for `document.fonts.ready`).

The blank frame people see on award sites is usually the canvas clearing before the poster exists, or the overlay unmounting a frame before the first draw. Paint the poster first. Clear the canvas only after it has drawn over that poster.

## 7. Navigation and footer

Awwwards publishes the weights used by jurors: Design 40%, Usability 30%, Creativity 20%, Content 10%, with outlier scores trimmed. https://www.awwwards.com/about-evaluation/ (cited in the harness study; the weights are the ones that page states). A beautiful footer that cannot be tabbed through loses the usability 30. A correct footer that looks like an unstyled list loses the design 40. Both have to be true.

Navigation, beyond the menu mechanics in section 2:

- The bar is a designed object: the wordmark, the links, and the current state are set in the brand type, not in a default system face (the type gate in `240r-fonts.md`).
- Desktop links and the phone button meet the tap rules. Keyboard order matches the visual order.
- The current page is marked in text or with `aria-current`, not by colour alone.
- A scroll-away bar that returns on scroll-up is allowed on `(pointer: fine)`. On `(pointer: coarse)`, prefer a stable bar. A bar that hides and shows on every touch scroll fights the URL bar and causes mis-taps. If it does hide, the target that brings it back is at least 44px and it does not cover the focused element.

Footer:

- Treat it as the last scene, not a dump. A large wordmark, a short colophon, a way back to the top, and the credit line for type and imagery (`CREDITS.json`, audit item 3 and harness idea 12).
- Contrast meets the body 4.5:1 already required in `packages/engine/src/brand/tokens.ts`.
- Safe-area padding on the bottom.
- No hover-only columns. On a coarse pointer the columns are just columns.
- The keyboard can reach every link, and the focus ring is visible on the dark ground the desk likes to use.

Page transitions, when the brief asks for them, are one orchestrated moment (harness idea 9), opacity or a shared element, refresh ScrollTrigger on the new page, and tear the WebGL context down on leave (one context per page). Reduced motion skips the slide.

## What 241 should change

Mapped in `240r-summary.md`. The code facts this note relies on:

- `packages/templates/shared/webgl.ts` `shouldUsePoster` (the width cutoff).
- `packages/qa/src/screenshots.ts` `REVIEW_WIDTHS`.
- `packages/qa/src/lighthouse-gate.ts` (phone floor, desktop does not gate).
- `packages/qa/src/performance-gate.ts` (LCP, INP, CLS, 5 MiB GLB, one context, mobile still).
- `packages/qa/src/playwright-opener.ts` (Chromium only).
- `packages/qa/src/detail-pass.ts` (today a single desktop-sized pass).
- `packages/knowledge/packs/drei/SKILL.md` and `packages/knowledge/packs/three/SKILL.md`.
