---
name: scroll-choreography
site-types: editorial, marketing, product, portfolio
motion-appetite: high
section-kinds: story, gallery, horizontal
techniques: pin, scrub, split-text, shared-element, horizontal
versions: gsap@3.15.0, lenis@1.3.27
---

# Scroll choreography

Pin, scrub, a horizontal track, a masked line reveal, and a shared element that continues into the next section. These are starting patterns. CSS scroll-driven animation, Motion, anime.js, and a view transition can carry the same idea when they fit the section better.

## Pin and scrub

scrub: 1 lets the timeline catch the scroll instead of locking to it. anticipatePin: 1 takes the jump out of the pin. invalidateOnRefresh: true recomputes when the layout changes.

```ts
import gsap from "gsap"; // gsap@3.15.0
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
const timeline = gsap.timeline({
  scrollTrigger: {
    trigger: ".scene",
    start: "top top",
    end: "+=150%",
    pin: true,
    scrub: 1,
    anticipatePin: 1,
    invalidateOnRefresh: true,
  },
});
timeline.from(".headline", { yPercent: 100, opacity: 0 }).to(".bg", { scale: 1.15, ease: "none" }, 0);
```

Animate transform and opacity. Call ScrollTrigger.refresh after fonts and images. Snap, when you want it, can use labelsDirectional with a short duration between 0.2 and 0.8 seconds. getVelocity is there when a later effect should react to how fast the section is passing.

## Horizontal track

The track eases with ease: "none" so it stays linear with the scroll. The end is a function of the panel row, and invalidateOnRefresh keeps that length honest.

```ts
const panels = gsap.utils.toArray(".panel");
const distance = () => panels.length * window.innerWidth - window.innerWidth;
gsap.to(panels, {
  xPercent: -100 * (panels.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: ".horizontal",
    pin: true,
    scrub: 1,
    end: () => "+=" + distance(),
    invalidateOnRefresh: true,
  },
});
```

## Split lines

SplitText lines with a mask, expo.out, and a short stagger. Revert the split on cleanup. aria auto keeps the phrase available.

```ts
import { SplitText } from "gsap/SplitText";

const split = SplitText.create(".headline", { type: "lines", mask: "lines", aria: "auto" });
gsap.from(split.lines, {
  yPercent: 100,
  duration: 1.2,
  ease: "expo.out",
  stagger: 0.08,
  scrollTrigger: { trigger: ".headline", start: "top 80%" },
});
```

## Lenis on the ticker

One scroll owner. When Lenis is that owner, it updates ScrollTrigger and takes its frame from the GSAP ticker. A second raf is a second clock.

```ts
import Lenis from "lenis"; // lenis@1.3.27

const lenis = new Lenis({ autoRaf: false });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);
```

Lenis 1.3.26 and newer jumps immediately when the visitor asks for reduced motion. Leave that behavior on.

## Scroll to a target

lenis.scrollTo accepts a pixel value, a selector, "top", "bottom", or an element. Useful options: offset for a fixed header, duration, easing, lerp (about 0.08-0.12 for a calm move, and lerp wins over duration when both are set), immediate, lock, force, onStart, onComplete. anchors: true can catch in-page links, with an offset when the header is fixed.

When Lenis is active, lenis.scrollTo is the direct call. ScrollToPlugin can still move the window when Lenis is not the owner: offsetY for a header, autoKill so a user scroll cancels the tween. A pin does not add its spacing into that target. Resolve it with ScrollTrigger.getById and use trigger.start, or a scroll lookup.

GSAP has no lerp setting of its own. The stand-ins are a numeric scrub, gsap.utils.interpolate inside the ticker, or maath damp for a value that should keep following.

## Shared element

Flip can move one frame from a card to a detail view. A view transition can do that across pages. Keep a single element identity in the markup so the shared piece is the same node, not a copy.

## Reduced motion

gsap.matchMedia gives the reduced-motion query a static column. Pins release, tracks stack, headlines stay whole, and Lenis stays on the native scroller.

Source: ScrollTrigger, SplitText, and ScrollToPlugin options follow https://gsap.com/docs/v3/. Lenis scrollTo options follow https://github.com/darkroomengineering/lenis.
