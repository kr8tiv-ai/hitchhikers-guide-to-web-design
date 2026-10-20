---
name: stack-astro
version: 7.4.1
license: MIT
docs: https://docs.astro.build
llms: none
checked: 2026-10-19
npm: astro
description: How a generated Astro site follows STACK-DECISION.md and the shared motion module. React islands are the exception.
when-to-use: Use when the stack record picks astro, or when a site prompt adds pages, content, or motion on an Astro site.
paths:
  - packages/knowledge/packs/stack-astro/SKILL.md
---

# Astro

Read `STACK-DECISION.md` before you add a framework file. This pack applies when the pick is `astro`. Astro is the default for brand, marketing, portfolio, and content sites at motion levels 1 to 9, when the site type is not an app and there is no persistent canvas across routes.

## Versions

Framework and library versions are not pinned in this pack. When the site is created, re-resolve at install from the registry. The lockfile pins what install resolved. Do not treat a floating latest tag as the install instruction.

## Pages and content

Pages are Astro components. Blog posts and portfolio entries live in content collections. Ordinary markup stays in those components.

React is not the default. Add a React island only when `STACK-DECISION.md` says the site needs one. If that record requires an island, hydrate it with a client directive and leave the rest of the page as HTML. Plain Three.js is the 3D runtime. Do not add a React renderer for a scene the decision record did not ask for.

## Motion

Shared motion lives in `src/scripts/motion.ts`. That module is generated from `MOTION.md`. Call `bootMotion`. It owns `prefersReducedMotion`, `keepContentVisible`, and the single clock `onTick`. When the plan chose Lenis, Lenis calls `ScrollTrigger.update` and runs from `gsap.ticker` through `onTick`. A page that uses CSS `animation-timeline` does not also start Lenis.

Set `document.documentElement.dataset.page` to the page name in `MOTION.md` so one scroll owner starts.

`src/scripts/webgl.ts` exposes `getContext`. One WebGL context per page. Three, Theatre core, and raw WebGL subscribe through `onTick`. They do not start a second animation frame loop.

Theatre runtime is `@theatre/core` only. Do not import `@theatre/studio`.

If the page uses Astro view transitions, refresh ScrollTrigger after navigation. A second Lenis is a second scroll owner, so the motion module remains the owner.

## Transitions and images

Multi-page sites can use ClientRouter and transition:name on an element that continues across pages. Picture can ask for avif and webp. Islands stay the exception named above.

The motion plan names the libraries to start from. Add another library when the shot needs a technique the plan did not list. GSAP, including ScrollTrigger and SplitText, is the base engine when the plan uses it. Motion, anime.js, OGL or raw WebGL, and vanilla effects stay on the elements the plan named.

## Alternatives

Next.js is the pick for an app-style site, or for one persistent canvas across routes, while the motion level stays below 10. Vite plus React is the pick for a single-page world at level 10.

SvelteKit is not its own pack and not the default. Use it only when the user insisted. The 3D ecosystem is thinner.
