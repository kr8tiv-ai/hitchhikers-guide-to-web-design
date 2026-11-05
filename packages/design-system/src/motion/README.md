# Motion recipes

Page code imports recipes from `@hitchhiker/design-system/motion` and does not call `gsap.to`, `gsap.from`, `gsap.timeline`, or `ScrollTrigger.create` itself.

```ts
import { createPinnedTimeline, motionSetup } from "@hitchhiker/design-system/motion";
```

Every recipe returns `{ kill, refresh, reduced }`. `kill()` is safe to call twice. Call it on unmount, and on Astro's swap:

```ts
import { bindAstroBeforeSwap } from "@hitchhiker/design-system/motion";

const unbind = bindAstroBeforeSwap([handle]);
```

Reduced motion is a designed end state. The visitor sees the finished frame, or an opacity fade under 200ms. Recipes do not leave content hidden and do not delete the section.

`motionSetup()` is the only scroll owner. It constructs one Lenis with `autoRaf: false`, forwards `scroll` to `ScrollTrigger.update`, drives `lenis.raf` from the GSAP ticker (`time * 1000`), calls `gsap.ticker.lagSmoothing(0)`, and refreshes after fonts and images. The `(prefers-reduced-motion: reduce)` branch does not construct Lenis.

```ts
import { motionSetup } from "@hitchhiker/design-system/motion";

const scroll = motionSetup();
```

Reduced motion: elements marked `data-motion` are set to full opacity. Lenis stays off.

## pinnedTimeline

Pin and scrub a labelled timeline. `anticipatePin` is 1, `invalidateOnRefresh` is true, and the pin uses `transform` so the pin does not write layout.

```ts
import { createPinnedTimeline } from "@hitchhiker/design-system/motion";

const pin = createPinnedTimeline(section, {
  end: "+=150%",
  beats: [{ target: headline, vars: { yPercent: 24, opacity: 0 }, label: "rise" }],
});
```

Reduced motion: the section and each beat are shown in place (`opacity: 1`, `yPercent: 0`). No ScrollTrigger.

## horizontalTrack

Vertical scroll drives the track by `xPercent`. `end` is a function of track width minus viewport width, `ease` is `"none"`, and refresh invalidates the end.

```ts
import { createHorizontalTrack } from "@hitchhiker/design-system/motion";

const track = createHorizontalTrack(rail, { scrub: 1 });
```

Reduced motion: panels sit at `xPercent: 0` and full opacity. No pin.

## kineticType

SplitText reveal by `line`, `word`, or `char`, inside an overflow clip. `kill()` reverts the split and removes the clip.

```ts
import { createKineticType } from "@hitchhiker/design-system/motion";

const type = createKineticType(headline, { unit: "line" });
```

Reduced motion: the headline stays whole. No split, no clip, full opacity.

## scrollCamera

GSAP scrubs a plain `{ value }` from 0 to 1. The render loop reads `sample()`. This recipe does not start a second animation frame.

```ts
import { createScrollCamera } from "@hitchhiker/design-system/motion";

const camera = createScrollCamera(section, {
  keyframes: [
    { at: 0, position: { x: 0, y: 1, z: 4 }, lookAt: { x: 0, y: 0, z: 0 } },
    { at: 1, position: { x: 2, y: 1, z: 2 }, lookAt: { x: 0, y: 0, z: 0 } },
  ],
});
// Inside the existing R3F or Three frame: camera.sample()
```

Reduced motion: progress is 1, so `sample()` returns the last keyframe. The section stays visible.

## preloaderHandoff

Resolves after `document.fonts.ready` and the hero media decode, then plays the hero intro.

```ts
import { createPreloaderHandoff } from "@hitchhiker/design-system/motion";

const intro = createPreloaderHandoff(hero, { media: heroImage, overlay });
await intro.ready;
```

Reduced motion: the hero is visible immediately and `ready` still resolves. The overlay, when present, is hidden.

## frameSequence

Canvas frames scrubbed with scroll. The scroll snaps to a whole frame. A poster paints before the sequence decodes.

```ts
import { createFrameSequence } from "@hitchhiker/design-system/motion";

const frames = createFrameSequence(canvas, {
  frames: ["/frames/01.webp", "/frames/02.webp"],
  poster: posterImage,
});
```

Reduced motion: the last frame is painted and the canvas is fully opaque. No pin.

## pageTransition

Uses `document.startViewTransition` when the browser has it. Otherwise GSAP Flip.

```ts
import { createPageTransition } from "@hitchhiker/design-system/motion";

const transition = createPageTransition(card);
await transition.go(() => card.classList.add("is-open"));
```

Reduced motion: `go()` applies the update and leaves the element at full opacity. No Flip tween.

## batchReveal

One `ScrollTrigger.batch` for a repeated card list.

```ts
import { createBatchReveal } from "@hitchhiker/design-system/motion";

const cards = createBatchReveal(document.querySelectorAll(".card"));
```

Reduced motion: every card is shown at full opacity and `yPercent: 0`. No batch.

## parallaxLayers

Transform-only parallax. Travel is capped at 12 percent.

```ts
import { createParallaxLayers } from "@hitchhiker/design-system/motion";

const layers = createParallaxLayers(scene, {
  layers: [
    { target: back, travel: 6 },
    { target: front, travel: 10 },
  ],
});
```

Reduced motion: each layer stays at `yPercent: 0` and full opacity.

## snapToLabels

A pinned timeline that settles on its labels (`labelsDirectional`, duration 0.2 to 0.8, delay 0.1).

```ts
import { createSnapToLabels } from "@hitchhiker/design-system/motion";

const snap = createSnapToLabels(section, {
  labels: [
    { name: "start", at: 0 },
    { name: "end", at: 1 },
  ],
});
```

Reduced motion: the section is shown in its rested state. No snap and no pin.

## microInteractions

Custom cursor on a fine pointer only, one magnetic control per page, and a hover that changes transform, opacity, or a shader uniform.

```ts
import { createMicroInteractions } from "@hitchhiker/design-system/motion";

const micro = createMicroInteractions(page, {
  magnetic: true,
  magneticTarget: button,
  media: poster,
});
```

A second magnetic control throws. Coarse pointers get no cursor. Reduced motion: no cursor, no listeners, content at full opacity. `kill()` releases the magnetic slot.

## Style worlds

`recipesFor` and `signatureRecipeCandidates` map a style world and an appetite from 1 to 10 onto this list. Appetite 1 to 3 stays on `batchReveal`, subtle `parallaxLayers`, and `microInteractions`. An editorial world uses the pinned track. A brutalist world uses kinetic type. Appetite 9 to 10 in `3d-world` adds `scrollCamera` and `preloaderHandoff`.
