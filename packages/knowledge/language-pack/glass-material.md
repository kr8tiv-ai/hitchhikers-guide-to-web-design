---
name: glass-material
webgl: true
family: material
triggers: glass, transmission, material
when-to-use: A hero object that should read as glass, liquid, or polished product plastic.
---

## Ranges

MeshPhysicalMaterial with transmission 0.92-0.98, thickness 0.5-2, roughness 0.05-0.15, ior 1.5, clearcoat 1, and attenuationColor from the brand. Add dispersion for chromatic aberration, or a chromatic aberration pass.

## Snippet

```ts
import * as THREE from "three";

const glass = new THREE.MeshPhysicalMaterial({
  transmission: 0.95,
  thickness: 1.2,
  roughness: 0.08,
  ior: 1.5,
  clearcoat: 1,
  attenuationColor: brandColor,
  attenuationDistance: 0.6,
  dispersion: 0.1,
});
```

## Performance

Transmission renders the scene behind the mesh. Keep one physical material on the hero object, and keep the rest of the scene cheaper. A poster stands in when the frame budget drops.

## Reduced motion

The glass still renders on the first frame, or the poster replaces the canvas. No extra spin is required for the material to read.

## Source

Fields follow three.js MeshPhysicalMaterial at https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial. dispersion defaults to 0 in those docs. 0.1 is a starting chromatic split, not a documented default.
