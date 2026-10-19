---
name: post-processing
site-types: product, portfolio
motion-appetite: high
section-kinds: hero, showcase
techniques: bloom, grain, vignette, tone-mapping
versions: three@0.186.1, postprocessing@6.39.5, @react-three/postprocessing@3.1.3
---

# Post-processing

Chains for a scene that should look filmed. One composer per page. These are starting chains, and a grade in CSS can be the whole treatment when the section has no canvas.

## Filmic product

ACES filmic tone mapping, exposure 1.1. UnrealBloomPass at strength 0.3-0.8, radius 0.4, threshold 0.85, so only the highlights bloom. Then FilmGrain and a light Vignette.

```ts
import * as THREE from "three"; // three@0.186.1
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.4, 0.85));
```

## The same chain in pmndrs postprocessing

Bloom, Noise, and Vignette. On a React island the fiber wrapper exposes those names. The strength, radius, and threshold windows stay the ones above. Grain opacity stays near 0.08-0.16 so it reads as film, not fog.

```ts
import { BloomEffect, EffectComposer, NoiseEffect, RenderPass, VignetteEffect } from "postprocessing"; // postprocessing@6.39.5
import { Bloom, EffectComposer as FiberComposer, Noise, Vignette } from "@react-three/postprocessing"; // @react-three/postprocessing@3.1.3
```

Use one of those composers, not both on the same canvas.

## A quiet chain

Threshold at the high end, strength at 0.3, vignette barely darker than the corners, grain on a single still frame. This is the chain for a brand that wants polish without a glow.

## A hero that is mostly type

Skip the composer. A CSS grade and a still grain overlay keep the text sharp. Bloom behind type is how a headline turns to mush.

## Performance and reduced motion

Half-resolution bloom when the device is warm. On a phone, keep tone mapping and drop Noise and Vignette. Reduced motion freezes grain and leaves the exposure alone. The poster is the fallback when the canvas does not start.

Source: UnrealBloomPass follows https://github.com/mrdoob/three.js/blob/master/examples/jsm/postprocessing/UnrealBloomPass.js. ACESFilmicToneMapping is the three.js renderer setting. Bloom, Noise, and Vignette follow https://github.com/pmndrs/postprocessing and the fiber wrapper at https://github.com/pmndrs/react-postprocessing.
