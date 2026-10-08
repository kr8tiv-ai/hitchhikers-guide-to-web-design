# 06 · Recommended pre-loaded library stack

Research date: 2026-10-05. Versions are `latest` on the npm registry today. Licenses are the npm `license` field, except GSAP's, which comes from [gsap.com/standard-license](https://gsap.com/standard-license). Pin exact versions in the starter and refresh them monthly.

## 1. Framework choice

| Option | Version | Strengths for award-style sites | Weaknesses | Verdict |
|---|---|---|---|---|
| **Astro** | 7.3.5 | HTML-first and fast by default; islands let you add React/Svelte (R3F) only where needed; built-in View Transitions (`<ClientRouter />`) and image optimization (`<Picture>`); content collections suit blogs. **Matt's own site, antihero.community, runs Astro 7.3.5** (its `generator` meta tag), and both of his website guides prescribe Astro | Island boundaries make state shared across the page (e.g. one persistent WebGL canvas across routes) harder | **Default** |
| Next.js | 16.3.8 | Full React app; great for R3F-heavy single experiences, app-like sites, auth, dynamic data | Heavier JS baseline; App Router plus a persistent canvas plus transitions takes real expertise; Vercel-centric | Use for level 9–10 "world" sites or sites with app features |
| Vite + React | Vite 8.3.3, React 19.3 | Minimal, full control; ideal for a single-page immersive R3F experience | You hand-roll routing, SEO and image pipeline | Option for single-page 3D experiences |
| SvelteKit | Kit 3.0.1, Svelte 5.57 | Tiny runtime, great DX, good animation ergonomics | Smaller ecosystem for 3D (Threlte exists), fewer agent training examples | Not the default |

**Recommendation:** Astro, with React islands only when R3F is needed. Escalate to Next.js only when the brief needs app features or one persistent 3D world across routes. Matt's prompts also specify "Vanilla JS for the logic" in Astro, so plain Three.js is fine below motion level 9.

## 2. Motion and scroll

| Package | Version | License | Role | Notes |
|---|---|---|---|---|
| `gsap` | 3.15.0 | GSAP Standard "no charge" | Core timelines plus **all plugins**: ScrollTrigger, SplitText, MorphSVG, DrawSVG, Flip, Observer, ScrollSmoother, Draggable, Inertia, MotionPath, ScrambleText, Physics2D… | [gsap.com/pricing](https://gsap.com/pricing/): "GSAP is now 100% free for all users, thanks to Webflow's support." Plugins ship in the main package. GSAP stays the base engine. |
| `@gsap/react` | 2.1.2 | GSAP Standard | `useGSAP()` hook with cleanup | |
| `lenis` | 1.3.26 | MIT | Smooth scroll | Use `lenis`, **not** the deprecated `@studio-freight/lenis` (last published 2024-03). Wire it to ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`, drive it from `gsap.ticker`), as in Matt's Prompt 13 |
| `motion` (Motion, formerly Framer Motion) | 14.0.0 | MIT | Declarative React/JS animation, layout animations, `whileInView` | `framer-motion` is the same version. Good inside React islands; GSAP stays primary |
| `animejs` | 4.5.0 | MIT | Scoped DOM and SVG motion | Ships in the toolkit. The picker assigns it per effect. |
| `@barba/core` | 2.10.3 | MIT | Page transitions for MPAs | Last publish 2024-08; prefer native View Transitions / Astro ClientRouter |
| `swup` | 4.10.0 | MIT | Page transitions, actively maintained | Fallback for non-Astro builds |
| `lottie-web` / `@lottiefiles/dotlottie-web` | 5.13.0 / 0.80.0 | MIT | After Effects animations | dotLottie is smaller and more modern |
| `@rive-app/canvas` / `@rive-app/react-canvas` | 2.44.0 / 4.36.0 | MIT | Interactive state-machine vectors | |
| `@theatre/core` | 0.7.2 | Apache-2.0 | Keyframed camera paths and sequencing with a studio UI | **Last publish 2024-05.** `@theatre/core` ships in the toolkit. |

### GSAP

D-001 withdrew the MIT fallback and the avoid Theatre advice. GSAP stays the base engine.

## 3. 3D and graphics

| Package | Version | License | Role |
|---|---|---|---|
| `three` | 0.186.1 | MIT | Core 3D (WebGL; also ships a WebGPU renderer) |
| `@react-three/fiber` | 9.8.1 | MIT | React renderer for Three (React 19) |
| `@react-three/drei` | 10.7.9 | MIT | Helpers: `useGLTF` (Draco/Meshopt), `Environment` (HDRIs), `ScrollControls`, `Text`, `Float`, `PerformanceMonitor`, `AdaptiveDpr` |
| `postprocessing` / `@react-three/postprocessing` | 6.39.5 (Zlib) / 3.1.3 (MIT) | | Bloom, DOF, noise, vignette, SMAA |
| `three-stdlib` | 2.36.1 | MIT | Loaders and examples as modules |
| `maath` | 0.10.8 | MIT | Easing, damping and random helpers for R3F |
| `ogl` | 1.0.11 | Unlicense | Tiny WebGL lib for shader backgrounds and hover effects (last publish 2025-01) |
| `pixi.js` | 8.22.0 | MIT | 2D WebGL/WebGPU sprites and filters |
| `@google/model-viewer` | 4.3.1 | Apache-2.0 | Drop-in `<model-viewer>` for simple product spins and AR (level 6–7) |
| `@splinetool/runtime` / `@splinetool/react-spline` | 2.0.71 / 4.1.0 | (none listed on npm) | Embed Spline scenes; quick, but a heavier runtime and less control. Check Spline's terms |
| `matter-js` | 0.20.0 | MIT | 2D physics (last publish 2024-06) |
| `@dimforge/rapier3d-compat` / `@react-three/rapier` | 0.21.0 (Apache-2.0) / 2.2.0 | | 3D physics |
| Debug: `lil-gui` 0.21.0, `leva` 0.10.1, `r3f-perf` 7.2.3 | | MIT | Dev only; strip from prod |

### 3D asset tooling (pipeline the agent runs automatically)
- `@gltf-transform/cli` 4.5.1 (MIT). Per [gltf-transform.dev/cli](https://gltf-transform.dev/cli), the one-step optimization is `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp`, and `gltf-transform inspect input.glb` prints a report. The function list also includes `meshopt`, `simplify`, `dedup`, `prune`, `resample`, `quantize` and `textureCompress`. We default to `--compress meshopt` (decoded by `meshoptimizer` 1.3.0) or `draco` (`draco3d` 1.5.7), plus WebP/AVIF textures. Use KTX2/Basis when texture memory dominates (`toktx` / KTX-Software, external binary).
- `sharp` 0.35.5 for image derivatives, and ffmpeg for video (see the media pipeline below).
- Matt's Prompt 17 encodes the runtime rules: one shared GLTFLoader with Draco and Meshopt, one renderer per page, pixel ratio capped at 2, pause when offscreen or tab hidden, HDRI from Poly Haven, ACES/AgX tone mapping, desktop-only (≥1024px with a fine pointer) with a still image for mobile and reduced motion, and a drop-in `/public/models/custom/` folder.

## 4. Styling and UI

| Package | Version | Notes |
|---|---|---|
| `tailwindcss` | 4.3.3 (MIT) | Fast to author, **but** Matt's NO SLOP rules ban "the default Tailwind look (gray-50 backgrounds, rounded-xl cards, indigo buttons, everything centered)". If used, ship a brand token config and lint for default palette classes. Matt's setup prompt says "Add Tailwind only if I said so in the brief" |
| `shadcn` CLI | 4.21.2 (MIT) | Good for forms, dialogs and accessible primitives inside React islands; restyle fully to brand tokens. Not for marketing-section layout |
| Plain CSS with custom properties | | Default for marketing sites: brand color variables, a fluid type scale (`clamp()`), a 4/8-based spacing scale (as GSD's UI-SPEC template requires) |

## 5. QA and performance tooling
`@playwright/test` 1.63.0 (screenshots at 375/768/1440/1920, console-error and 404 checks, `toHaveScreenshot()` visual diffs), `lighthouse` 13.5.0 / `@lhci/cli` 0.15.1 (assertions in CI), `unlighthouse` 0.19.1 (site-wide scans), and SVG tracing via `vtracer` 1.0.8 (ISC, color tracing) or `potrace` 2.1.8 (**GPL-2.0**, so avoid bundling it in a closed app; shelling out to the binary is a legal question).

## 6. Mobile performance budgets

Google's Core Web Vitals "good" thresholds at the 75th percentile ([web.dev/articles/vitals](https://web.dev/articles/vitals)): **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.** Matt's media prompt targets "LCP under 2.5s, no layout shift".

Recommended per-page budgets for the watchdog. These are my starting proposals, to be tuned against real builds:

| Budget (mobile, 4G profile) | Level 1–4 | Level 5–7 | Level 8–10 |
|---|---|---|---|
| JS (gzip, initial) | ≤ 90 KB | ≤ 160 KB | ≤ 250 KB initial; 3D chunk lazy-loaded after LCP |
| Hero media | image ≤ 200 KB AVIF | poster ≤ 200 KB; **no scrub video on mobile** | still render ≤ 250 KB on mobile |
| Video loops | n/a | ≤ ~4 MB each (Matt's Prompt 19), muted, `playsinline`, `preload="metadata"` | same |
| GLB (desktop) | n/a | n/a | ≤ 3–5 MB after meshopt/draco plus WebP/KTX2 |
| Fonts | 2 families, woff2, preload 2 files | same | same |
| Lighthouse perf (mobile) | ≥ 90 | ≥ 80 | ≥ 70 on the 3D page, ≥ 85 elsewhere |
| Runtime | No long tasks > 200 ms on interaction | ScrollTrigger refresh after fonts and images load | Pause the render loop offscreen; `PerformanceMonitor` drops DPR under ~45 fps |

## 7. Default "starter kit" (pre-loaded template repo)

```
astro@7 (TypeScript strict) + @astrojs/react (only if level ≥ 8 with R3F)
gsap@3.15 (+ @gsap/react in islands) · lenis@1.3
three@0.186 (+ @react-three/fiber@9, drei@10, postprocessing) — lazy, level ≥ 8
@lottiefiles/dotlottie-web OR @rive-app/canvas — only if the section plan uses E4/E5
Plain CSS tokens (Tailwind opt-in) · shadcn only for forms/dialogs in islands
@gltf-transform/cli · sharp · ffmpeg (system) · vtracer
@playwright/test · @lhci/cli
src/scripts/motion.ts  (shared eases/durations, reduced-motion gate, Lenis↔ScrollTrigger wiring)
src/three/loader.ts    (shared GLTFLoader + DRACO + Meshopt, KTX2 optional)
src/data/credits.ts    (typed credits; "anything borrowed gets an entry in the same commit")
scripts/optimize-media.mjs · scripts/fetch-assets.mjs · tests/qa.spec.ts
AGENTS.md + .grok/rules/*.md + .grok/skills/<stack-usage-specs>/SKILL.md
/_archive (never delete, move here) · /public/models/custom (drop-in)
```

**Usage-spec skills to pre-write (Tessl-registry style, see 02):** `gsap-scrolltrigger-lenis`, `splittext-reveals`, `astro-view-transitions-gsap-reinit` (kill and refresh triggers after navigation, as in Matt's Prompt 16), `r3f-performance`, `scroll-video-encoding`, `reduced-motion`, `credits-and-licenses`. Grok Build discovers these from `.grok/skills/` and shows them as slash commands ([docs](https://docs.x.ai/build/features/skills-plugins-marketplaces)).
