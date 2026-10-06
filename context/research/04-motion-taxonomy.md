# 04 · Web motion taxonomy plus the "motion appetite" picker

Research date: 2026-10-05. Library versions come from the npm registry today (see 06). Example sites are Awwwards-listed sites whose Awwwards tags match the technique (see 03), or demos linked from official docs. The 1–10 scale extends the rule of thumb in Matt's *Websites on Autopilot* guide: "Motion appetite 1 to 4: smooth scroll and reveals. 5 to 7: add a scroll video and transitions. 8 to 10: add 3D."

## Part 1: Taxonomy

Each entry gives what the visitor sees, the default library, a mobile rule and an example. "Weight" is a rough relative cost: L (light, CSS or a few KB of JS), M (a GSAP plugin or small lib), H (WebGL, video, physics). Weights are my estimates, not measurements.

### A. Scroll-linked
| # | Type | What it is | Library (default → alt) | Weight | Mobile rule | Example |
|---|---|---|---|---|---|---|
| A1 | **Smooth / inertial scroll** | Weighted, eased scrolling | [Lenis](https://lenis.darkroom.engineering) → GSAP [ScrollSmoother](https://gsap.com/docs/v3/Plugins/ScrollSmoother/) | L | Keep native touch scroll; turn it off under reduced motion | Darkroom sites; Pangram Pangram (tag locomotive-scroll) |
| A2 | **Scroll reveals** | Elements fade or slide in on entering view | GSAP [ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) → Motion `whileInView` → CSS [`animation-timeline: view()`](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline) | L | Fine | Almost every SOTD |
| A3 | **Pinned sections / scrollytelling** | Section sticks while its content animates through a timeline | ScrollTrigger `pin` + `scrub` | M | Shorter pin distances | Persepolis Reimagined, Orano |
| A4 | **Horizontal scroll track** | Vertical scroll drives sideways movement | ScrollTrigger with a pinned container | M | Often converted to a vertical stack | Matt's polish list ("horizontal GSAP scroll") |
| A5 | **Parallax layers** | Layers move at different speeds | ScrollTrigger / Lenis / CSS scroll timelines | L | Reduce depth | Simply Chocolate, Pangram Pangram (tag parallax) |
| A6 | **Scroll-scrubbed video** | Video plays forward and back with the scroll | ScrollTrigger `scrub` on `video.currentTime`; ffmpeg all-keyframe encode (`-g 1`); fallback to a WebP frame sequence on canvas (120–180 frames) | H | **Poster plus copy only** | Apple AirPods Pro; Matt's Prompt 15 |
| A7 | **Image-sequence canvas** | Pre-rendered frames drawn as you scroll (product spins) | Canvas + ScrollTrigger | H | Fewer, smaller frames | Apple product pages |
| A8 | **Scroll-driven 3D camera** | Camera flies along a path through a scene | Three/R3F + ScrollTrigger or drei `ScrollControls`, [Theatre.js](https://www.theatrejs.com/docs/latest) for authored paths | H | Static render | Igloo Inc, Star Atlas |

### B. Typography
| # | Type | Library | Weight | Example |
|---|---|---|---|---|
| B1 | **Line/word/char split reveals** (masked rise, stagger) | GSAP [SplitText](https://gsap.com/docs/v3/Plugins/SplitText/) (now free) | L–M | Synchronized Studio |
| B2 | **Scramble / decode text** | GSAP [ScrambleText](https://gsap.com/docs/v3/Plugins/ScrambleTextPlugin/) | L | Tech and dev portfolios |
| B3 | **Marquees / tickers** | CSS keyframes or GSAP; velocity-linked via Observer | L | Matt's polish list |
| B4 | **Variable-font axis animation** | CSS `font-variation-settings` + GSAP | L | Type foundries |
| B5 | **Kinetic / WebGL type** (distort, liquid, 3D text) | Three/OGL shaders, troika-three-text (via drei `<Text>`) | H | Codrops demos |

### C. Navigation and transitions
| # | Type | Library | Weight | Note |
|---|---|---|---|---|
| C1 | **Page transitions** | [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) / Astro `<ClientRouter />` → [Barba](https://barba.js.org) / [Swup](https://swup.js.org) | L–M | Cross-document view transitions aren't supported in Firefox (caniuse), so treat them as progressive enhancement |
| C2 | **Shared-element morph** (card → detail) | GSAP [Flip](https://gsap.com/docs/v3/Plugins/Flip/), View Transitions `view-transition-name` | M | |
| C3 | **Full-screen menu reveal** | GSAP timeline, clip-path | L | Matt's nav prompt (focus trap, Escape closes) |
| C4 | **Preloader → intro handoff** | GSAP timeline + asset loading manager | M | Required whenever a WebGL hero exists |

### D. Pointer and micro-interactions (desktop-first)
| # | Type | Library | Weight | Mobile |
|---|---|---|---|---|
| D1 | **Custom cursor / follower** | GSAP `quickTo` | L | Off on touch devices |
| D2 | **Magnetic buttons** ⛔ banned by default (Matt's anti-slop rule, 2026-10-05: "no weird magnetic buttons") | GSAP + pointer math | L | Off |
| D3 | **Hover distortion / reveal images** | OGL/Three shader on the hovered image | M–H | Off |
| D4 | **Hover glow / heat** | CSS pseudo-element, optional shared WebGL canvas | L | Static faint glow (Matt's Prompt 18) |
| D5 | **Button, link and form micro-feedback** | CSS / [Motion](https://motion.dev/docs) / GSAP | L | Yes, as tap feedback |
| D6 | **Drag / throw / inertia carousels** | GSAP [Draggable](https://gsap.com/docs/v3/Plugins/Draggable/) + [Inertia](https://gsap.com/docs/v3/Plugins/InertiaPlugin/) | M | Yes (touch) |

### E. Vector and illustration
| # | Type | Library | Weight | Example |
|---|---|---|---|---|
| E1 | **SVG line drawing** | GSAP [DrawSVG](https://gsap.com/docs/v3/Plugins/DrawSVGPlugin/) | L | Diagrams, signatures |
| E2 | **SVG shape morphing** | GSAP [MorphSVG](https://gsap.com/docs/v3/Plugins/MorphSVGPlugin/) | L | Logo intros |
| E3 | **Motion along a path** | GSAP [MotionPath](https://gsap.com/docs/v3/Plugins/MotionPathPlugin/) | L | |
| E4 | **Lottie** (After Effects → JSON / dotLottie) | lottie-web / `@lottiefiles/dotlottie-web` ([Lottie](https://airbnb.io/lottie/)) | M | Icons, explainers |
| E5 | **Rive** (state-machine interactive vectors) | [Rive](https://rive.app/) runtimes | M | Interactive mascots, toggles |

### F. Real-time graphics (WebGL / WebGPU)
| # | Type | Library | Weight | Example |
|---|---|---|---|---|
| F1 | **Shader backgrounds** (gradients, noise, fluid) | [OGL](https://github.com/oframe/ogl) (tiny) / Three `ShaderMaterial` | M | koox, Prometheus Fuels (tags webgl/glsl) |
| F2 | **Particles / point clouds** | Three `Points`, GPGPU; R3F | H | Lusion, Active Theory |
| F3 | **3D product hero** (GLB, rotate on mouse or scroll) | Three/R3F + drei; or `<model-viewer>` for simple cases | H | Opal Tadpole, MA |
| F4 | **Full 3D world / game-like navigation** | Three/R3F + physics | H+ | Bruno Simon, Messenger |
| F5 | **Post-processing** (bloom, DOF, grain, chromatic aberration) | [postprocessing](https://pmndrs.github.io/postprocessing/public/docs/) / [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) | H | Most WebGL SOTYs |
| F6 | **2D WebGL sprites / filters** | [PixiJS](https://pixijs.com) | M | Synchronized Studio, The Other Side of Truth (tag pixijs) |
| F7 | **No-code 3D scene embed** | [Spline](https://spline.design) runtime | M–H | Quick 3D for appetite 6–7; heavier runtime, less control |

### G. Physics and generative
| # | Type | Library | Weight |
|---|---|---|---|
| G1 | **2D physics** (falling tags, draggable blobs) | [Matter.js](https://brm.io/matter-js/) (last npm publish 2024-06) / GSAP Physics2D | M |
| G2 | **3D physics** | [Rapier](https://rapier.rs) via `@react-three/rapier` | H |
| G3 | **Generative / noise fields** | Canvas 2D / OGL | M |

### H. Media and sound
| # | Type | Notes |
|---|---|---|
| H1 | **Ambient video loops** | Muted, `playsinline`, poster, AV1 WebM + H.264 MP4, ≤ ~4 MB (Matt's Prompt 19) |
| H2 | **Hover-to-play card loops** | Grok Imagine loop from a still; poster on mobile |
| H3 | **Opt-in ambient sound** | Always paused by default, fade in on click (Matt's masterclass prompt) |

### Non-negotiable motion rules (from Matt's RULES template plus the GSAP accessibility docs)
- Animate only `transform` and `opacity`. Use one shared ease/duration file (`src/scripts/motion.ts`). Respect [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion): disable Lenis, show content statically, give reduced users a still in place of a scrubbed video. GSAP's `matchMedia()` is the usual tool ([gsap.com/resources/a11y](https://gsap.com/resources/a11y/)).
- One "wow" per section. Effects come last. Every heavy effect needs a calm phone version.

## Part 2: The motion appetite picker (1–10)

The interview should show each level as a 5–8 second clip or a live example link, then ask the user to pick a level *and* a personality (calm/expensive, snappy/playful, heavy/cinematic, from Matt's Visual Interview Q5).

| Level | Name | Includes (cumulative) | Example to show | Mobile behavior | Stack add-ons |
|---|---|---|---|---|---|
| **1** | Calm brochure | Native scroll, CSS hover states, fade-in on load | A classic SiteInspire-style studio site | Same | none (Astro + CSS) |
| **2** | Gentle | + Scroll reveals (A2), button micro-feedback (D5) | Frans Hals Museum | Same | GSAP core |
| **3** | Polished | + Lenis smooth scroll (A1), SplitText headline reveals (B1), marquee (B3) | Pangram Pangram | Lenis off on touch | + Lenis, SplitText |
| **4** | Editorial | + Parallax (A5), image clip-path reveals, page transitions (C1) | Synchronized Studio | Reduced parallax | + View Transitions |
| **5** | Expressive | + One pinned story section (A3), custom cursor (D1, only if it carries the brand), Lottie/Rive accents (E4/E5) | Chungi Folio | Cursor off | + Rive/Lottie |
| **6** | Cinematic lite | + **Scroll-scrubbed hero video** (A6) or image sequence, horizontal track (A4), shader gradient background (F1) | Apple AirPods Pro | Poster plus copy | + ffmpeg pipeline, OGL |
| **7** | Cinematic | + Multiple scroll scenes, shared-element transitions (C2), hover-distort images (D3), opt-in sound (H3) | Don't Board Me, Dark (Netflix) | Simplified scenes | + Flip, Barba/Swup if needed |
| **8** | 3D accent | + **One 3D moment** (F3) with HDRI lighting, desktop only, still image on mobile (Matt's Prompt 17) | Opal Tadpole, MA | Pre-rendered still | + Three/R3F, drei, gltf-transform |
| **9** | 3D-led | + Scroll-driven camera (A8), particles (F2), post-processing (F5), branded preloader (C4) | Lusion, Star Atlas, Lando Norris | Lite scene or stills | + postprocessing, Theatre.js (optional) |
| **10** | 3D scroll movie / world | + Full world, physics (G2), game-like navigation (F4), real-time multiplayer optional | Igloo Inc, Messenger, Bruno Simon | Dedicated mobile path | + Rapier, custom shaders |

### How the picker drives the build
- **Prompt count scales with level.** Levels 1–4 skip 3D, scroll video and glow (Matt's "local business" row). Levels 5–7 add scroll video and transitions. Levels 8–10 add the 3D prompt chain (asset fetch → optimize → scene → mobile still → perf pass).
- **Budgets tighten as the level rises:** the watchdog enforces an FPS floor and LCP targets (see 06/10). Above 8, the reviewer must confirm a mobile fallback exists before the 3D prompt is marked done.
- **Personality sets the easing tokens:** calm = long `power3/expo.out` eases (0.8–1.4s), snappy = `back.out`/short (0.3–0.5s), cinematic = slow scrub with heavy Lenis lerp. These go into `motion.ts` once and every later prompt references them.
- **Per-section override:** the section plan picks one effect per section from the taxonomy IDs above (e.g. `hero: A6`, `about: B1+A5`, `work: C2`, `cta: D2`), so prompts can say exactly which effect to build.
