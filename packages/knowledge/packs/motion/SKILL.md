---
name: motion
description: Copy one recipe from the full motion toolkit. The Guide ships every library, and a page imports the one its effect uses.
when-to-use: Use when a site prompt adds one effect, or when planMotion has named the library for that effect.
paths:
  - packages/knowledge/packs/motion/SKILL.md
  - packages/knowledge/packs/motion/recipes.md
---

# Motion

The Guide ships the full D-001 toolkit. GSAP is the base engine, including ScrollTrigger and SplitText. Lenis, Three.js, OGL or raw WebGL2, Motion, anime.js, Theatre core, CSS scroll-driven animations, and vanilla JS ship beside it. A generated page imports one recipe from `recipes.md`. It does not load the other libraries for that effect.

`planMotion` in `packages/engine/src/spec/motion.ts` assigns one owner. The ids are `gsap`, `lenis`, `three`, `ogl`, `motion`, `anime`, `theatre`, `css-scroll`, and `vanilla`. Copy the heading that matches the id.

## One owner

One scroll owner per page. Lenis calls `ScrollTrigger.update` from `gsap.ticker`, or the page uses a native scroller with CSS `animation-timeline`. Those two do not share a page. One WebGL context per page. OGL is for a shader when Three is absent. When Three is already up, the shader stays on that context. One timeline owner per element. GSAP, Motion, and anime.js do not animate the same property.

`gsap.ticker` is the single clock. Three, Theatre core, and raw WebGL subscribe to it. They do not start a second animation frame loop.

SplitText is a GSAP plugin, not a separate page-wide library.

Theatre runtime is `@theatre/core`, pinned at 0.7.2. The studio editor is excluded.
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 3.

## How to copy

Open `recipes.md`. Take one heading. Leave the others out of the page. Reduced motion is a short rule in that file, not a library, and it still applies.

Animate `transform` and `opacity`, unless the effect is a shader or a clip-path and the prompt says so. Effects at level 6 and above keep a calm phone path.
