---
name: typography
webgl: false
family: type
triggers: typography, text-led, type voice
when-to-use: A text-led section where the type is the picture.
---

## Ranges

A fluid display from about clamp(2.5rem, 6vw, 7rem). Tracking from -0.03em on a large serif to 0.04em on a grotesque. Measure about 58-72ch. Display line-height about 0.9-1.05. Body line-height about 1.4-1.6.

## Snippet

```css
.display {
  font-size: clamp(2.5rem, 6vw, 7rem);
  letter-spacing: -0.02em;
  line-height: 0.96;
  max-width: 18ch;
}
.prose {
  max-width: 65ch;
  line-height: 1.5;
}
```

## Performance

Ship the font files you use, with a size-adjusted fallback so the first paint does not jump. Two families is enough for a section.

## Reduced motion

Type stays put. A reveal, if you add one, fades in place instead of traveling.

## Source

The clamp scale and the measure are our starting points for a text-led section, in the same spirit as a fluid type scale. They are not a library default.
