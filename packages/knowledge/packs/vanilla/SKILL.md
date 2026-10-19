---
name: vanilla
version: built-in
license: none-stated
docs: https://developer.mozilla.org/en-US/docs/Web/API
llms: none
checked: 2026-10-19
npm: vanilla
description: Small page scripts with no animation library. One module, deferred, and cleaned up.
when-to-use: Use when the effect is a fade, a class toggle, or a measurement that does not need a timeline.
paths:
  - packages/knowledge/packs/vanilla/SKILL.md
---

# Vanilla

One module per island. Load it with defer. Cache layout reads, then write in requestAnimationFrame, so a scroll handler does not thrash layout. Remove listeners when the page changes. prefers-reduced-motion is a matchMedia query. When it matches, keep the content visible and skip the motion.

A vanilla effect can sit beside GSAP or a canvas. It does not have to replace them. The page still has one scroll owner.

Source: https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia
