---
name: shader-recipes
site-types: product, portfolio
motion-appetite: high
section-kinds: hero, shader
techniques: transmission, dispersion, iridescence, grain, caustics
versions: three@0.186.1, maath@0.10.8, postprocessing@6.39.5
---

# Shader recipes

Transmission, dispersion, iridescence, grain, and caustics. Each one is a starting recipe. A still, a grade, or a small OGL program can carry the same mood when a full material is more than the section needs.

## Transmission

MeshPhysicalMaterial. transmission 0.92-0.98, thickness 0.5-2, roughness 0.05-0.15, ior 1.5, clearcoat 1, attenuationColor from the brand. The mesh has to be in front of something, or the transmission has nothing to show.

```ts
import * as THREE from "three"; // three@0.186.1

const glass = new THREE.MeshPhysicalMaterial({
  transmission: 0.95,
  thickness: 1.2,
  roughness: 0.08,
  ior: 1.5,
  clearcoat: 1,
  attenuationColor: brandColor,
  attenuationDistance: 0.6,
});
```

## Dispersion

The material field `dispersion` defaults to 0 in the three.js docs. A light split around 0.1 is a starting chromatic edge. A chromatic aberration pass in postprocessing is the other way, and it tints the whole frame rather than only the glass.

```ts
glass.dispersion = 0.1;
```

## Iridescence

iridescence 0.8-1, iridescenceIOR 1.2-1.6, iridescenceThicknessRange 100-400. The documented default IOR is 1.3 and the documented thickness range is 100 to 400.

```ts
glass.iridescence = 1;
glass.iridescenceIOR = 1.3;
glass.iridescenceThicknessRange = [100, 400];
```

## Grain

A film pass at opacity 0.08-0.16. In pmndrs postprocessing the pass is NoiseEffect. Keep it under the bloom so the frame does not fog.

```ts
import { NoiseEffect } from "postprocessing"; // postprocessing@6.39.5

const grain = new NoiseEffect({ premultiply: true });
grain.blendMode.opacity.value = 0.12;
```

## Caustics

Project a soft pattern onto the receiving plane. Intensity 0.15-0.35, drift 0.05-0.12. A looping texture or a cheap noise field is enough. A photon simulation is rarely worth the frame.

## A field, when the hero is the shader

Value noise, then fbm at 4-6 octaves, then a domain warp of 0.1-0.35 at a base frequency of 2-4. maath can damp the pointer or the scroll into the uniforms. maath@0.10.8. Freeze time for reduced motion and keep a poster behind the canvas.

Source: MeshPhysicalMaterial fields follow https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial. NoiseEffect follows https://github.com/pmndrs/postprocessing. Domain warping is described at https://iquilezles.org/articles/warp/. The numbers above that are not library defaults are our starting windows.
