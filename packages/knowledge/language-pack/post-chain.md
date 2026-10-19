---
name: post-chain
webgl: true
family: post
triggers: bloom, post, vignette
when-to-use: A high-appetite scene that wants a filmed image rather than a raw render.
---

## Ranges

EffectComposer with UnrealBloomPass (strength 0.3-0.8, radius 0.4, threshold 0.85) plus FilmGrain and Vignette. ACES filmic tone mapping, exposure 1.1.

## Snippet

```ts
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.4, 0.85));
```

FilmGrain and Vignette sit on that same composer. pmndrs postprocessing names those passes Noise and Vignette. three.js names the bloom pass UnrealBloomPass. Either stack can carry the chain.

## Performance

One composer for the page. Bloom blurs a half-resolution buffer when the device is warm. Skip the extra passes on a phone and keep the tone mapping.

## Reduced motion

Tone mapping and a static grade can stay. Animated grain and a pulsing bloom stop. The poster remains the fallback when the canvas does not start.

## Source

UnrealBloomPass strength, radius, and threshold follow the three.js addons pass at https://github.com/mrdoob/three.js/blob/master/examples/jsm/postprocessing/UnrealBloomPass.js. ACESFilmicToneMapping is the three.js renderer enum. Noise and Vignette are the pmndrs postprocessing names at https://github.com/pmndrs/postprocessing.
