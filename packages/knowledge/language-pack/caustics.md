---
name: caustics
webgl: true
family: shader
triggers: caustics
when-to-use: A glass, water, or pool moment where light should pool on the receiving surface.
---

## Ranges

A caustic pattern at intensity 0.15-0.35 and a drift speed of 0.05-0.12. Project it onto the receiving plane. Keep the hero object itself on the glass material.

## Snippet

```ts
caustic.intensity = 0.22;
caustic.speed = 0.08;
receiver.material.emissiveMap = caustic.texture;
```

## Performance

A looping texture or a cheap noise field beats a photon simulation in the browser. One receiving surface is enough.

## Reduced motion

Freeze the caustic on a single frame. The light pattern can remain as a still.

## Source

This is our recipe for a browser caustic, not a copied shader. Pair it with the glass material entry when the object itself is transmissive.
