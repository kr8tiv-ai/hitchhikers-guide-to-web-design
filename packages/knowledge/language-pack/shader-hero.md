---
name: shader-hero
webgl: true
family: shader
triggers: shader, noise, fbm, domain warp, domain-warp
when-to-use: A hero field of moving color when the brand wants a shader instead of a photographed still.
---

## Ranges

Value noise into fbm, then a domain warp. Octaves 4-6. Warp amplitude 0.1-0.35. Base frequency 2-4. Drive it with a slow time uniform on the shared ticker.

## Snippet

```glsl
float warp = fbm(uv * 3.0);
float field = fbm(uv * 3.0 + warp * 0.2);
```

## Performance

One fullscreen triangle or a small plane on the page's one context. Cap the pixel ratio. Swap in a still when the frame time slips.

## Reduced motion

Show the still, or a single frame of the field with the time uniform frozen.

## Source

fbm and domain warping are described by Inigo Quilez at https://iquilezles.org/articles/warp/. The snippet is our shorthand, not a copy of that article's shader.
