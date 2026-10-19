---
name: gsap
version: 3.15.0
license: "Standard license, https://gsap.com/community/standard-license/"
docs: https://gsap.com/docs/v3/
llms: https://gsap.com/llms.txt
checked: 2026-10-19
npm: gsap
description: Timeline, ScrollTrigger, SplitText, Flip, matchMedia, and context cleanup for generated pages.
when-to-use: Use when the art direction names a scroll film, a pinned sequence, a split headline, or a shared-element flip.
paths:
  - packages/knowledge/packs/gsap/SKILL.md
---

# GSAP

A timeline is the sequence. ScrollTrigger pin and scrub hold a section while that timeline plays, then release it. SplitText on a headline uses aria auto so the phrase stays available, and the split is reverted on cleanup. Flip is for a shared layout that moves between two states. gsap.matchMedia gives the reduced-motion query a static layout. gsap.context scopes selectors and reverts them when the page changes.

Markers stay off in the shipped page. The standard license covers commercial site use. This pack is notes and names, not a copy of the docs.

A page keeps one scroll owner. Lenis on the GSAP ticker is one owner. ScrollSmoother is a different owner.

Source: https://gsap.com/docs/v3/
