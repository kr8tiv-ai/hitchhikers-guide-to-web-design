---
name: scroll-choreography
site-types: editorial, marketing, product, portfolio
motion-appetite: high
section-kinds: story, gallery, horizontal
techniques: pin, scrub, split-text, shared-element, horizontal
versions: gsap@3.15.0, lenis@1.3.27, maath@0.10.8, three@0.186.1
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

## Snap and velocity

Snap to the timeline labels when a section should settle. Duration stays between 0.2 and 0.8 seconds, with a short delay. `self.getVelocity()` is there when a later effect should react to how fast the section is passing.

```ts
scrollTrigger: {
  snap: {
    snapTo: "labelsDirectional",
    duration: { min: 0.2, max: 0.8 },
    delay: 0.1,
    ease: "power1.inOut",
  },
  onUpdate: (self) => {
    const velocity = self.getVelocity();
    return velocity;
  },
}
```

## Advanced pinning

`anticipatePin` takes the jump out of the pin. `pinSpacing: false` leaves the layout to you. The same element can pin again at a later range. `endTrigger` sets the far end when the trigger itself is not the end of the story.

```ts
ScrollTrigger.create({
  trigger: ".story",
  start: "top top",
  end: "+=80%",
  pin: true,
  pinSpacing: false,
  anticipatePin: 1,
  invalidateOnRefresh: true,
});
ScrollTrigger.create({
  trigger: ".story",
  start: "center center",
  endTrigger: ".story-end",
  end: "bottom bottom",
  pin: true,
  pinSpacing: false,
  anticipatePin: 1,
  invalidateOnRefresh: true,
});
```

## Three from scroll progress

Drive the camera from `self.progress`. `damp3` follows with a smoothTime in the 0.12-0.18 window. A numeric scrub on the trigger is the scroll link. The damp is the camera's own follow.

```ts
import * as THREE from "three"; // three@0.186.1
import { damp3 } from "maath/easing"; // maath@0.10.8

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const target = new THREE.Vector3();
ScrollTrigger.create({
  trigger: ".scene",
  start: "top top",
  end: "+=200%",
  scrub: 1,
  onUpdate: (self) => {
    const progress = self.progress;
    target.set(progress * 2, 0.2, 4 - progress);
    damp3(camera.position, target, 0.15, 1 / 60);
    camera.lookAt(0, 0.2, 0);
  },
});
```

## Performance

Animate transform and opacity. Call `ScrollTrigger.refresh()` after fonts, images, and layout changes. `gsap.matchMedia()` holds the reduced-motion query and the phone layout. `ScrollTrigger.batch()` covers a long list of similar elements without one trigger each.

```ts
const refresh = () => {
  ScrollTrigger.refresh();
};
document.fonts.ready.then(refresh);
for (const image of Array.from(document.images)) {
  if (image.complete) continue;
  image.addEventListener("load", refresh, { once: true });
}

const media = gsap.matchMedia();
media.add("(prefers-reduced-motion: reduce)", () => {
  gsap.set(".headline", { yPercent: 0, opacity: 1 });
});
media.add("(max-width: 767px)", () => {
  gsap.set(".track", { xPercent: 0 });
});

ScrollTrigger.batch(".card", {
  onEnter: (batch) => {
    gsap.from(batch, { yPercent: 100, opacity: 0, stagger: 0.08, ease: "expo.out" });
  },
});
```

## Scroll to a target

When Lenis drives scroll, `lenis.scrollTo` is the call. The target is a pixel value, a selector, `"top"`, `"bottom"`, or an element. `lerp` in the 0.08-0.12 window is the premium feel, and it takes priority over duration and easing when both are set. Leave `lerp` off when you want a timed ease. Lenis 1.3.26 and newer jumps immediately when the visitor asks for reduced motion. `immediate: true` is that same jump for a call you make yourself.

`anchors: true` catches in-page links. A fixed header uses an offset.

```ts
const lenis = new Lenis({ autoRaf: false, anchors: true });
new Lenis({
  autoRaf: false,
  anchors: { offset: -80, duration: 1.2 },
});

const target = "#about";
lenis.scrollTo(target, {
  offset: -80,
  duration: 1.4,
  easing: (t: number) => 1 - Math.pow(1 - t, 3),
  lerp: 0.1,
  immediate: false,
  lock: false,
  force: false,
  onStart: () => {},
  onComplete: () => {},
  userData: { source: "nav" },
});
lenis.scrollTo(0, { immediate: true });
```

ScrollToPlugin moves the window when Lenis is not the scroll owner. `offsetY` clears a fixed header. `autoKill: true` lets a user scroll cancel the tween. `"max"` scrolls to the end of the page. A pin does not add its spacing into that target. Resolve it with `ScrollTrigger.getById(id).start`, or with GreenSock's `getScrollLookup` helper.

```ts
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

gsap.registerPlugin(ScrollToPlugin);
gsap.to(window, { duration: 1.2, scrollTo: { y: "#about", offsetY: 80 }, ease: "power2.inOut" });
gsap.to(window, { duration: 1, scrollTo: { y: "max", autoKill: true } });

const about = ScrollTrigger.getById("about");
if (about) {
  gsap.to(window, {
    duration: 1.2,
    scrollTo: { y: about.start, autoKill: true },
    ease: "power2.inOut",
  });
}
const lookup = getScrollLookup(".section", "top top");
gsap.to(window, { duration: 1.2, scrollTo: { y: lookup("#about"), autoKill: true }, ease: "power2.inOut" });
```

## Smoothing

GSAP has no lerp option. A numeric `scrub` smooths scroll-linked tweens. `gsap.utils.interpolate(current, target, 0.1)` inside the ticker eases a number toward a goal. `damp` from maath is the critically damped follow. A normal tween with an ease is the one-shot.

```ts
import { damp } from "maath/easing"; // maath@0.10.8

let current = 0;
let target = 1;
gsap.ticker.add(() => {
  current = gsap.utils.interpolate(current, target, 0.1);
});

let damped = 0;
gsap.ticker.add((_time, deltaMs) => {
  damped = damp(damped, target, 0.15, deltaMs / 1000);
});

gsap.to(".headline", { yPercent: 0, duration: 1.2, ease: "expo.out" });
```

## Shared element

Flip can move one frame from a card to a detail view. A view transition can do that across pages. Keep a single element identity in the markup so the shared piece is the same node, not a copy.

## Reduced motion

gsap.matchMedia gives the reduced-motion query a static column. Pins release, tracks stack, headlines stay whole, and Lenis stays on the native scroller.

Source: ScrollTrigger, SplitText, ScrollToPlugin, and getScrollLookup follow https://gsap.com/docs/v3/. Lenis scrollTo options follow https://github.com/darkroomengineering/lenis. damp and damp3 follow https://github.com/pmndrs/maath. PerspectiveCamera follows https://threejs.org/docs/.
