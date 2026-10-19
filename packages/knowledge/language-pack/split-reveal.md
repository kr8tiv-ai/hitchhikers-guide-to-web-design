---
name: split-reveal
webgl: false
family: reveal
triggers: line reveal, splittext, reveal
when-to-use: A headline or a short stanza that arrives line by line.
---

## Ranges

SplitText lines with a mask and an expo.out stagger. Duration about 1.0-1.2 s. Stagger about 0.06-0.1 s.

## Snippet

```ts
const split = SplitText.create(".headline", { type: "lines", mask: "lines", aria: "auto" });
gsap.from(split.lines, {
  yPercent: 100,
  duration: 1.2,
  ease: "expo.out",
  stagger: 0.08,
  scrollTrigger: { trigger: ".headline", start: "top 80%" },
});
```

## Performance

Split the headline, not the body copy. Revert the split when the page changes so the phrase stays available to assistive tech.

## Reduced motion

Skip the split and show the headline in place. The words stay selectable.

## Source

SplitText mask and line splits follow the GSAP SplitText docs at https://gsap.com/docs/v3/Plugins/SplitText/.
