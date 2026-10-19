---
name: lenis
version: 1.3.27
license: MIT
docs: https://github.com/darkroomengineering/lenis
llms: none
checked: 2026-10-19
npm: lenis
description: Smooth scroll on the GSAP ticker, with reduced motion left on and cleanup when the page changes.
when-to-use: Use when the art direction wants eased scrolling and layered parallax on a story column.
paths:
  - packages/knowledge/packs/lenis/SKILL.md
---

# Lenis

Import the stylesheet. Leave respectReducedMotion at its default so a reduced-motion visit keeps the native scroller. The GSAP ticker recipe listens for scroll, updates ScrollTrigger, and runs raf from the ticker with lag smoothing off. A second auto raf is a second clock, so the ticker stays the clock. Destroy the instance when the page swaps. data-lenis-prevent lets a dialog scroll on its own.

A page keeps one scroll owner. ScrollSmoother is a different owner, so this recipe is the Lenis plus ticker pair.

Source: https://github.com/darkroomengineering/lenis
