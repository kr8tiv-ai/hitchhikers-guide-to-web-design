---
name: scroll-pin
webgl: false
family: scroll
triggers: pin, scrub, scroll-pin
when-to-use: A section that holds still while a timeline catches up to the scroll.
---

## Ranges

ScrollTrigger pin with scrub: 1, anticipatePin: 1, invalidateOnRefresh: true. End the pin on a length you compute from the timeline, not a guessed pixel count.

## Snippet

```ts
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

## Performance

Animate transform and opacity. Call ScrollTrigger.refresh after fonts and images. One scroll owner on the page. If Lenis is that owner, update ScrollTrigger from its scroll event and run Lenis from the GSAP ticker.

## Reduced motion

gsap.matchMedia gives the reduced-motion query a static layout. The section stays complete, unpinned, and readable.

## Source

Pin, scrub, anticipatePin, and invalidateOnRefresh follow the GSAP ScrollTrigger docs at https://gsap.com/docs/v3/Plugins/ScrollTrigger/.
