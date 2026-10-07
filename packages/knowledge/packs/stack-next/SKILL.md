---
name: stack-next
description: How a generated Next.js site follows STACK-DECISION.md, the template router, and the shared motion module.
when-to-use: Use when the stack record picks next, or when a site prompt adds an app feature or a persistent canvas on Next.js.
paths:
  - packages/knowledge/packs/stack-next/SKILL.md
---

# Next.js

Read `STACK-DECISION.md` before you add a route. This pack applies when the pick is `next`. Next.js fits an app-style site, or one persistent canvas across routes, below a level 10 world. A persistent canvas at level 9 stays on Next.js.

## Versions

Framework and library versions are not pinned in this pack. When the site is created, re-resolve at install from the registry. The lockfile pins what install resolved. Do not treat a floating latest tag as the install instruction.

## Router

Follow the template's router. This note does not invent an app directory or a pages directory. The template you add later owns those files. When the record asked for a persistent canvas, keep one canvas mounted for the life of that router.

## Motion

Shared motion lives in `src/scripts/motion.ts`, the same path the other stacks use. That module is generated from `MOTION.md`. Call `bootMotion`. It owns `prefersReducedMotion`, `keepContentVisible`, and the single clock `onTick`. When the plan chose Lenis, Lenis calls `ScrollTrigger.update` and runs from `gsap.ticker` through `onTick`. Do not also set CSS `animation-timeline` on that page.

Set `document.documentElement.dataset.page` to the page name in `MOTION.md` so one scroll owner starts.

`src/scripts/webgl.ts` exposes `getContext`. One WebGL context per page. Three, Theatre core, and raw WebGL subscribe through `onTick`. They do not start a second animation frame loop.

Theatre runtime is `@theatre/core` only. Do not import `@theatre/studio`.

Import only the libraries the motion plan assigned. GSAP, including ScrollTrigger and SplitText, is the base engine when the plan uses it.

## React and Three

Add `@react-three/fiber` only for a React scene the motion plan named. Smoke-test `@react-three/fiber` against the installed Three version. If the check fails, drive object properties from `@theatre/core`. Run the same check for `@theatre/r3f` when a Theatre sheet drives that scene. Plain Three through `getContext` remains available when the plan did not ask for a React scene.
