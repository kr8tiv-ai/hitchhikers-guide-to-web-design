---
id: "242c"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["242b"]
title: "DON'T PANIC splash hero: cosmos video loop (nebula alternate), live comets and debris, Three.js star layer, scroll cue into the desk"
---

# 242c. DON'T PANIC splash hero

## Why
The desk exists to turn a brief into an Awwwards-calibre, AI-slop-free site that looks stunning on desktop, iOS, Android and tablets, set in curated foundry fonts, and is fast. The desk's own front door should prove it can do that. Right now the home page opens straight into tools. A first-time visitor should land on something that feels like the Guide itself: a calm, deep-space "DON'T PANIC" that is beautiful, fast on a phone, and then gets out of the way and drops them into the app. Everything here follows the same rules the desk enforces on customer sites.

Font licenses are NOT verified. Do not add license checks.

## Source assets
Two Grok Imagine loops are in `C:\Users\lucid\Desktop\hh-pending-241\assets\`, outside the repo:
- **Primary:** `hh-cosmos-loop.mp4` (16 MB). A faster, hyper-real fly-through with an hourglass nebula, a white dwarf, asteroids and comets.
- **Alternate:** `hh-nebula-loop.mp4` (8.4 MB, 10 s, 720p). A calmer nebula fly-through. Ship it as an alternate the splash can switch to: a config value or a data attribute, plus a URL param such as `?splash=nebula` for review. It also serves as the fallback if the primary fails to load.

Use these as masters. Don't commit the masters. Commit only the optimized outputs for both. Check each master's real resolution and duration with ffprobe before choosing the encode tiers.
## What to build
1. A full-viewport splash at the top of the desk app's home page (`/`), above the existing first screen. It reads **DON'T PANIC**, with **The Hitchhiker's Guide to Web Design** beneath it.
2. Background video (the cosmos loop as primary, the nebula loop as alternate; encode both the same way):
   - Re-encode each loop with ffmpeg into AV1 in WebM and H.264 in MP4, at 1080p and 720p. The source is 720p, so for 1080 upscale with a good scaler (lanczos) only if it holds up visually. Otherwise ship 720 as the top tier and note it.
   - Make the loop seamless: crossfade the tail into the head if there's a visible seam.
   - Add a poster image (AVIF plus WebP or JPEG fallback) taken from a strong frame.
   - Use `muted autoplay loop playsinline`, `preload="metadata"`, and pick the source by `<source media>` / size.
   - Keep the total bytes on a phone small: target the 720 AV1 under about 1.5 MB.
   - Record the ffmpeg commands in a script under the repo (for example `scripts/encode-splash.mjs`) so the assets can be rebuilt.
3. Our own Three.js layer on top, rendered at native screen resolution, so the scene stays crisp on big and high-DPI screens even where the video tops out at 720 or 1080.
   - Live comets: a few, crossing occasionally, with soft glowing tails.
   - Debris: small tumbling asteroid fragments, sparse.
   - Star particles: drifting points with depth.
   - Gentle cursor and scroll parallax.
   - Keep it tasteful: the live layer adds the crisp detail the upscaled video can't, it doesn't fight the type, and it blends with what's in the footage (additive points, matching color temperature).
   - Native resolution means up to `devicePixelRatio`, within the per-tier DPR cap below: full DPR on capable desktops and tablets, capped on phones. When the GPU tier is low, reduce particle count before lowering the resolution.
   - Use the 241c recipes (adaptive WebGL tiers, the DOM-synced WebGL recipe, the preloader handoff) and the phone performance budget.
4. Typography and motion by the desk's own rules:
   - A curated foundry display face from the library (packages/engine/src/brand/type-library.ts), never the overused defaults, with a strong type scale. Use fluid sizing so DON'T PANIC is huge but never clips on a 320px screen.
   - One orchestrated entrance moment (the 241g "one bold thing" rule): for example, a letter-spaced reveal of DON'T PANIC as the video fades up.
   - Real contrast over the video (a subtle scrim or vignette) that passes WCAG AA.
5. A scroll cue: a small, clearly labelled control ("Enter the Guide" or a down chevron with an accessible name) that smoothly scrolls to the app below. It must work from the keyboard (Enter/Space) and land focus on the first app heading. Add a skip link so keyboard and screen-reader users can jump straight to the app.

## Performance and accessibility
- It must look stunning on desktop, iOS Safari, Android Chrome and tablets. Use smarter rendering rather than stripping effects:
  - lazy-load Three.js with a dynamic import, after first paint and idle
  - cap DPR per tier (native DPR on capable desktops and tablets; for example 1.5 on phones), and drop particle count before resolution
  - adapt particle count to the GPU tier
  - pause both the WebGL loop and the video when the splash is offscreen (IntersectionObserver) or the tab is hidden
- `prefers-reduced-motion`: no video autoplay and no WebGL. Show the poster with a gentle CSS fade or a slow, subtle drift at most. `prefers-reduced-data` / Save-Data: the poster only.
- Lighthouse: run per device (the 241d per-device runner) on `/` and meet the existing budgets. Pay particular attention to LCP: the LCP element should be the headline text or the poster, never a late video. Keep CLS at 0, and keep TBT within budget with Three.js deferred.
- Don't block the app: the existing first screen, tour, sample, New project and resume all still work, and nothing in the splash steals focus or intercepts clicks below it.

## Tests
- Playwright at 375, 768 and 1440:
  - the splash renders with both lines of text
  - the cosmos video (or its poster) is the default, and `?splash=nebula` selects the alternate
  - the scroll cue scrolls to the app and moves focus there
  - the skip link works
  - with reduced motion: no video playing and no WebGL canvas, the poster is visible
  - scrolling past the splash pauses the video and the render loop
- Update any existing e2e specs that assume the first screen sits at the top of `/` (for example showcase, bug-scan and identity), so they scroll or use the skip link instead of weakening their checks. The bug-scan (no console errors, no serious axe violations) must still pass, with the splash included.
- Unit tests for the DPR cap and tier selection.
- Run the full repo checks and the full Playwright suite 3 times in a row locally, and leave everything passing.

## Rules
Don't deploy, publish, send anything or delete user data. Don't touch Paradise Found. Don't start or stop the desk server on port 4175. Small, logical commits; finish with the commit below and a clean tree.

## Commit
```
feat(app): DON'T PANIC splash hero with cosmos loop, live comets and stars, and scroll cue (242c)
```