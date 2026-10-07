# Motion recipes

The Guide ships every library in the D-001 toolkit. A page imports one recipe. `planMotion` names the owner. Do not paste these blocks into one module.

## GSAP and Lenis on gsap.ticker

Scroll owner: `lenis`. ScrollTrigger listens on the shared clock. It does not own a second effect. This page does not use a native scroll timeline.

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

export function startLenis(): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }
  const lenis = new Lenis({ autoRaf: false });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number): void => {
    lenis.raf(time * 1000);
  };
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  return () => {
    gsap.ticker.remove(tick);
    lenis.destroy();
  };
}
```

## GSAP SplitText

SplitText is a GSAP plugin, not a separate page-wide library. Owner: `gsap`.

```ts
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

export function splitHeadline(target: string): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }
  const split = SplitText.create(target, { type: "lines", mask: "lines" });
  const tween = gsap.from(split.lines, {
    yPercent: 110,
    opacity: 0,
    duration: 0.8,
    stagger: 0.08,
    ease: "power3.out",
  });
  return () => {
    tween.kill();
    split.revert();
  };
}
```

## CSS scroll-driven animations

Owner: `css-scroll`. This recipe is for a native scroller. Do not add a smooth-scroll owner on the same page.

```css
@keyframes hh-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@supports (animation-timeline: view()) {
  .hh-reveal {
    animation-name: hh-rise;
    animation-duration: auto;
    animation-fill-mode: both;
    animation-timeline: view();
    animation-range: entry cover;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hh-reveal {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```

## Motion in a React island

Owner: `motion`. Use this only inside a React island when the stack is next or vite-react. On Astro, `planMotion` assigns the same reveal to `gsap`.

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({ children }: { children: ReactNode }): ReactNode {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <motion.div
      initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: reduce ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

## anime.js stagger

Owner: `anime`. anime.js owns this SVG stagger. GSAP does not also own the element. The scope stays on the root you pass.

```ts
import { animate, createScope, stagger } from "animejs";

export function staggerMarks(root: ParentNode & Element): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const node of root.querySelectorAll("path")) {
      if (node instanceof SVGElement) node.style.opacity = "1";
    }
    return () => {};
  }
  const scope = createScope({ root }).add(() => {
    animate("path", {
      opacity: [0, 1],
      delay: stagger(80),
      duration: 700,
      ease: "outCubic",
    });
  });
  return () => {
    scope.revert();
  };
}
```

## OGL shader

Owner: `ogl`. OGL opens one WebGL2 context. Use this when Three is absent from the page. `gsap.ticker` is the shared clock. It does not own the shader.

```ts
import gsap from "gsap";
import { Camera, Geometry, Mesh, Program, Renderer } from "ogl";

const VERT = "attribute vec2 position; void main(){ gl_Position = vec4(position, 0.0, 1.0); }";
const FRAG = "precision highp float; uniform float uTime; void main(){ float shade = 0.5 + 0.5 * sin(uTime); gl_FragColor = vec4(shade, 0.35, 0.2, 1.0); }";

export function mountShader(canvas: HTMLCanvasElement): () => void {
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = window.matchMedia("(max-width: 430px)").matches;
  if (quiet || phone) return () => {};
  const renderer = new Renderer({
    canvas,
    webgl: 2,
    alpha: true,
    dpr: Math.min(window.devicePixelRatio, 2),
  });
  const gl = renderer.gl;
  const camera = new Camera(gl);
  camera.position.z = 1;
  const geometry = new Geometry(gl, {
    position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) },
  });
  const program = new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: { uTime: { value: 0 } },
  });
  const mesh = new Mesh(gl, { geometry, program });
  const tick = (time: number): void => {
    program.uniforms.uTime.value = time;
    renderer.render({ scene: mesh, camera });
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
  };
}
```

## Three.js lazy hero

Owner: `three`. The dynamic import keeps Three off the page until this hero mounts. This is the only WebGL context on the page. `gsap.ticker` is the shared clock.

```ts
import gsap from "gsap";

export async function mountHero(canvas: HTMLCanvasElement): Promise<() => void> {
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = window.matchMedia("(max-width: 430px)").matches;
  if (quiet || phone) return () => {};
  const THREE = await import("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  camera.position.z = 4;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xc8c2b4 }),
  );
  scene.add(mesh, new THREE.DirectionalLight(0xffffff, 2));
  const tick = (): void => {
    mesh.rotation.y += 0.01;
    renderer.render(scene, camera);
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    renderer.dispose();
  };
}
```

## Theatre core on the ticker

Owner: `theatre`. Import `@theatre/core` only. The studio editor is excluded. The state argument is a checked-in JSON file. `gsap.ticker` drives playback through a core raf driver, so Theatre does not open its own loop.

```ts
import { createRafDriver, getProject } from "@theatre/core";
import gsap from "gsap";

// Pin @theatre/core at 0.7.2.
// Source: hh-build-plan/RESEARCH-ADDENDUM.md section 3.

export function playScene(state: object): () => void {
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = window.matchMedia("(max-width: 430px)").matches;
  if (quiet || phone) return () => {};
  const driver = createRafDriver({ name: "gsap.ticker" });
  const tick = (time: number): void => {
    driver.tick(time * 1000);
  };
  gsap.ticker.add(tick);
  const project = getProject("hh-scene", { state });
  const sequence = project.sheet("Hero").sequence;
  void project.ready.then(() => {
    void sequence.play({ rafDriver: driver });
  });
  return () => {
    sequence.pause();
    gsap.ticker.remove(tick);
  };
}
```

## Vanilla IntersectionObserver fade

Owner: `vanilla`. One opacity change. No motion package.

```ts
export function fadeOnView(node: HTMLElement): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    node.style.opacity = "1";
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.target instanceof HTMLElement) {
        entry.target.style.opacity = "1";
        observer.unobserve(entry.target);
      }
    }
  });
  observer.observe(node);
  return () => {
    observer.disconnect();
  };
}
```

## Reduced motion

This section is not a library. `planMotion` does not assign it.

When `prefers-reduced-motion: reduce` matches, leave smooth scroll unstarted, skip scrub and autoplay, and keep the content visible. A phone at level 6 and above uses the calm path: a still, not the heavy scene.

```css
@media (prefers-reduced-motion: reduce) {
  .hh-motion {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```
