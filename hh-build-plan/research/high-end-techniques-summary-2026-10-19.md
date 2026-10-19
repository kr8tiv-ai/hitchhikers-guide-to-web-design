# Hitchhiker's Guide to Web Design: high-end techniques conversation (saved 2026-10-19)

Repo: https://github.com/kr8tiv-ai/hitchhikers-guide-to-web-design
Benchmark: aura.build

## 1. Making the harness more like aura.build
- Inject precise creative-dev language into prompts and knowledge packs (CatmullRomCurve3 with lerp damping; MeshPhysicalMaterial with transmission + chromatic aberration; EffectComposer with ACES + UnrealBloomPass + FilmGrain + Vignette).
- Curated skills/reference packs (archetypes, shader recipes, post-processing chains, locked versions) modeled on Aura skills and awwwards-3d.
- DESIGN.md + motion.ts as first-class outputs of brand/plan phases.
- Local skill inclusion so patterns load on demand.
- Stronger quality gates: Awwwards-style scoring + performance checks.

## 2. Best libraries
Core: GSAP (+ScrollTrigger/SplitText), Lenis, Three.js (r170+), @react-three/fiber + drei (React islands), postprocessing or Three EffectComposer, maath.
Supporting: Theatre.js, OGL, Motion, anime.js, Lottie/Rive, Rapier, gltf-transform.
Default framework: Astro + React islands (or Next.js).

## 3. Advanced GSAP ScrollTrigger
- Pin + scrub (scrub: 1 for smooth catch-up).
- Horizontal tracks: ease "none", function-based end, invalidateOnRefresh.
- SplitText mask reveals.
- Lenis + ScrollTrigger sync: lenis.on("scroll", ScrollTrigger.update) + gsap.ticker.
- Snap, getVelocity(), matchMedia for reduced motion, animate only transform/opacity, refresh after fonts/images.
- Drive Three.js cameras from progress with maath damping.

## 4. GSAP ScrollToPlugin
Animates scroll position; use offsetY and autoKill: true. With pinning, resolve the real target via ScrollTrigger.getById().start or getScrollLookup. Prefer Lenis.scrollTo when Lenis is active.

## 5. Lenis scrollTo
lenis.scrollTo(target, options). Options: offset, duration, easing, lerp, immediate, lock, force, onStart, onComplete, userData. anchors: true for automatic # links. Reduced motion jumps instantly (v1.3.26+). Preferred over ScrollToPlugin when Lenis drives scroll.

## 6. GSAP lerp equivalent
No direct lerp option. Use ScrollTrigger scrub (number) for scroll-linked smoothing, or gsap.utils.interpolate / maath damp inside the ticker for continuous values.

A PDF summary was generated elsewhere at artifacts/HH_Guide_High_End_Summary.pdf (not on this PC unless copied).
