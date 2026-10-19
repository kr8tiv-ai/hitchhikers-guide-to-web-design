---
name: object-showcase
site-types: product, portfolio
motion-appetite: high
section-kinds: hero, showcase
techniques: camera, lighting, materials, post
versions: three@0.186.1, @react-three/fiber@9.8.2, @react-three/drei@10.7.9, maath@0.10.8, gsap@3.15.0
---

# Object showcase

A product or hero object, held in a short camera move, with light that explains the form. These notes are a starting point. Remix them. GSAP, Three.js, React Three Fiber, drei, maath, Theatre.js, OGL, or a still photograph can all carry a version of this.

## Camera

A CatmullRomCurve3 path, followed with maath damp3 at a smoothTime of 0.12-0.18. The lookAt target leads the path by 0.3-0.5 s. FOV stays in 35-45 and opens a little when scroll velocity rises.

```ts
import * as THREE from "three"; // three@0.186.1
import { damp3 } from "maath/easing"; // maath@0.10.8

const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
damp3(camera.position, curve.getPointAt(progress), 0.15, delta);
camera.fov = 40;
```

Scroll can drive `progress` with a GSAP ScrollTrigger scrub. gsap@3.15.0. Theatre.js core can author the same path when the move is easier to keyframe than to sample.

## Light

Start with three lights. A key from the upper front-side, a fill near a third of the key, and a rim from behind so the silhouette leaves the background. An environment map from drei can fill the reflections. Keep the environment dim so it does not wash the key.

```ts
import { ContactShadows, Environment } from "@react-three/drei"; // @react-three/drei@10.7.9
import { Canvas } from "@react-three/fiber"; // @react-three/fiber@9.8.2
```

ContactShadows is one way to seat the object. A baked shadow plane is another. Pick the one that stays inside the frame budget.

## Material

For glass or a coated product, MeshPhysicalMaterial is a direct map: transmission 0.92-0.98, thickness 0.5-2, roughness 0.05-0.15, ior 1.5, clearcoat 1, attenuationColor from the brand. A metal needs a roughness map more than it needs transmission. The language pack holds the longer material notes.

## Post

ACES filmic tone mapping, exposure 1.1, then a light bloom. The post-processing pack has the chain. On a phone, keep the tone mapping and drop the extra passes. The first frame has a poster.

## Reduced motion

Show the poster, or the object on the first frame with the damp loop off. The name of the product stays in HTML.
