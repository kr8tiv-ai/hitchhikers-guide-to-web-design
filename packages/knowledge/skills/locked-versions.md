---
name: locked-versions
site-types: product, portfolio, editorial, marketing
motion-appetite: high
section-kinds: hero, showcase
techniques: versions
versions: three@0.186.1, gsap@3.15.0, lenis@1.3.27, @react-three/fiber@9.8.2, @react-three/drei@10.7.9, maath@0.10.8, postprocessing@6.39.5, @react-three/postprocessing@3.1.3, motion@14.4.0, @theatre/core@0.7.2, ogl@1.0.11, astro@7.4.1, animejs@4.5.0
---

# Locked versions

These pins are a set known to sit together. They come from the knowledge packs checked on 2026-10-19 and from the library notes in `context/research/06-library-stack.md`. A site may install a newer build when that build still fits the brief. The Astro, Next, and Vite starters in this repo currently install lenis 1.3.26 beside three 0.186.1 and gsap 3.15.0. The checked Lenis pack is 1.3.27, and that is the pin here.

Any appropriate library may carry an effect. This list is not a closed set.

```ts
import gsap from "gsap"; // gsap@3.15.0
import Lenis from "lenis"; // lenis@1.3.27
import * as THREE from "three"; // three@0.186.1
import { Canvas } from "@react-three/fiber"; // @react-three/fiber@9.8.2
import { Environment } from "@react-three/drei"; // @react-three/drei@10.7.9
import { damp3 } from "maath/easing"; // maath@0.10.8
import { BloomEffect, EffectComposer, NoiseEffect, VignetteEffect } from "postprocessing"; // postprocessing@6.39.5
import { Bloom, EffectComposer as FiberComposer, Noise, Vignette } from "@react-three/postprocessing"; // @react-three/postprocessing@3.1.3
import { motion } from "motion/react"; // motion@14.4.0
import { getProject } from "@theatre/core"; // @theatre/core@0.7.2
import { Renderer } from "ogl"; // ogl@1.0.11
import { animate } from "animejs"; // animejs@4.5.0
```

Astro at astro@7.4.1 is the default framework pin for a content site. React islands are the exception, and Next.js remains available when the site is an app or one canvas must persist across routes.

Theatre.js here is the core runtime. A camera path can also be a CatmullRomCurve3 with maath damping when a studio timeline is more than the scene needs.
