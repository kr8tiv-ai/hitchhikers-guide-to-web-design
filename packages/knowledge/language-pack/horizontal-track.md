---
name: horizontal-track
webgl: false
family: scroll
triggers: horizontal, track
when-to-use: A row of panels that moves sideways while the page scrolls vertically.
---

## Ranges

Horizontal tracks use ease: "none", a function-based end, scrub: 1, and invalidateOnRefresh: true. The linear ease keeps the track locked to the scroll.

## Snippet

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

## Performance

Translate the track. Avoid layout changes during the scrub. Refresh after the panels change size.

## Reduced motion

Stack the panels in document order and leave them in place. The content of every panel stays reachable.

## Source

The linear ease and function-based end follow GSAP ScrollTrigger practice at https://gsap.com/docs/v3/Plugins/ScrollTrigger/.
