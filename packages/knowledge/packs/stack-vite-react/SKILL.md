---
name: stack-vite-react
description: How a generated Vite plus React site runs a single-page level 10 world on the shared motion module.
when-to-use: Use when the stack record picks vite-react, or when a site prompt builds that single-page world.
paths:
  - packages/knowledge/packs/stack-vite-react/SKILL.md
---

# Vite plus React

Read `STACK-DECISION.md` before you add a view. This pack applies when the pick is `vite-react`. The site is a single page at motion level 10. Level 10 selects Vite plus React even when the site type is an app, because the world is the harder constraint.

## Versions

Framework and library versions are not pinned in this pack. When the site is created, re-resolve at install from the registry. The lockfile pins what install resolved. Do not treat a floating latest tag as the install instruction.

## Page

A client-side router is optional. Add one only when the section plan names more than one view inside the same page. Do not leave this pack for a multi-page framework in order to gain a router. Routing stays inside the single page.

## Motion

Shared motion lives in `src/scripts/motion.ts`, the same path the other stacks use. That module is generated from `MOTION.md`. Call `bootMotion`. It owns `prefersReducedMotion`, `keepContentVisible`, and the single clock `onTick`. When the plan chose Lenis, Lenis calls `ScrollTrigger.update` and runs from `gsap.ticker` through `onTick`. Do not also set CSS `animation-timeline` on that page.

Set `document.documentElement.dataset.page` to the page name in `MOTION.md` so one scroll owner starts.

`src/scripts/webgl.ts` exposes `getContext`. One WebGL context per page. Three, Theatre core, and raw WebGL subscribe through `onTick`. They do not start a second animation frame loop.

Theatre runtime is `@theatre/core` only. Do not import `@theatre/studio`.

Import only the libraries the motion plan assigned. GSAP, including ScrollTrigger and SplitText, is the base engine when the plan uses it. A level 10 page still keeps a calm phone path for heavy effects through `calmPhonePath`.

## React and Three

Add `@react-three/fiber` only for a React scene the motion plan named. Smoke-test `@react-three/fiber` against the installed Three version. If the check fails, drive object properties from `@theatre/core`. Run the same check for `@theatre/r3f` when a Theatre sheet drives that scene. Plain Three through `getContext` remains available when the plan did not ask for a React scene.
