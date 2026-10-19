---
name: grain
webgl: true
family: shader
triggers: film-grain, grain
when-to-use: A grade that needs a little film texture so flat color does not look plastic.
---

## Ranges

Grain opacity about 0.08-0.16. Animate it slowly on a desktop scene, or keep a single still frame of noise. Stay well under the bloom strength so the grain does not become fog.

## Snippet

```ts
const grainPass = new NoiseEffect({ premultiply: true });
grainPass.blendMode.opacity.value = 0.12;
```

## Performance

A full-screen noise pass is cheaper than a second bloom. On a phone, bake the grain into the grade and skip the pass.

## Reduced motion

Use one still frame of grain, or none. The picture stays graded either way.

## Source

NoiseEffect is the pmndrs postprocessing grain pass at https://github.com/pmndrs/postprocessing. The opacity window is our starting point.
