# DECISIONS (locked by Matt Haynes, product owner)

These override anything in CONTEXT-PACKAGE.md that conflicts. Treat them as locked decisions (Section 23: you may argue against one in CRITIQUE.md, but don't override it).

## D-001 Animation stack (2026-10-05)

Full list: GSAP, Three.js, raw WebGL/shaders, Motion (formerly Framer Motion), anime.js, Theatre.js, Lenis, CSS scroll-driven animations, vanilla JS.


- **GSAP is the locked default motion engine**, including ScrollTrigger and SplitText (all GSAP plugins ship free).
- **No GSAP caveats anywhere.** No risk entry, no open question and no fallback requirement about GSAP. Don't plan any work around replacing GSAP.
- **Full integrated toolkit (updated 2026-10-05, supersedes the earlier "optional add-ons" wording):** the app ships and wires in ALL of these, not as optional picks:
  - **GSAP** (base engine; ScrollTrigger, SplitText and the other free plugins)
  - **Three.js** (core, for 3D/WebGL)
  - **Motion** (motion.dev, formerly Framer Motion)
  - **anime.js**
  - **Theatre.js** (cinematic 3D timelines; this supersedes §15.3's "avoid Theatre.js by default" note; record its maintenance status and pin a version)
  - **Lenis** (smooth scroll)
  - **Native CSS scroll-driven animations**
  - **Raw WebGL / custom GLSL shaders** (e.g. via OGL or plain WebGL2) for distortion, noise, particles and image transitions
  - **Vanilla JS** (no framework lock-in; hand-written effects where they're the best tool)
- **The motion picker and the orchestrator choose the right tool per effect** (e.g. CSS scroll-driven for light reveals, GSAP/ScrollTrigger for sequenced scroll scenes and text splits, Three.js for 3D scenes, raw WebGL/GLSL (OGL or WebGL2) for shader effects like distortion, noise, particles and image transitions, Theatre.js for authored cinematic 3D timelines, Motion/anime.js where they fit best, vanilla JS for small hand-written effects), with every library shipped and integrated in the app's templates, knowledge packs and prompt generator. Generated sites still only load what their chosen effects use (tree-shaking / per-effect imports) so mobile budgets hold.
- The motion picker, motion spec, stack decision record, knowledge packs (motion, stack-usage-specs) and the build prompts must reflect this, including how the libraries coexist: one scroll source of truth (Lenis driving ScrollTrigger), one render loop shared by Three.js/Theatre.js/raw WebGL (one requestAnimationFrame ticker, ideally gsap.ticker), reduced-motion handling, mobile budgets, and each library's pinned version.

## D-002 Build plan v3: every review fix and 22 new prompts (2026-10-06)

- Every fix in the build-plan review (PATCHES §A to §F) is applied to `hh-build-plan/`. That includes the site-prompt generator rewrite (Grok-authored prompts, 50 to 150 per site, with a package validator) and the 34 broken checkpoint filenames.
- The repo org is **kr8tiv-ai** everywhere (`github.com/kr8tiv-ai/hitchhikers-guide-to-web-design`).
- Effort tags are re-balanced. Phase-end reviews and the final once-over run at **xhigh**.
- Prompts point at the v1 context package, `context/matt-answers.md`, research 03 to 12 and the source guides.
- The 22 new prompts (N01 to N22) are written in full and merged into the sequence. The plan is re-indexed to **159 files**: 117 builds, 41 review checkpoints and 1 final xhigh once-over. A checkpoint follows every 3 builds and every phase end. `INDEX.md`, `prompts/INDEX.md` and `ROADMAP.md` are regenerated, and `prompts/INDEX.md` carries the v2 to v3 renumbering map.

## D-003 Live Grok, agency-grade design, real integrations (2026-10-06)

- The interview, brand modules, reviewer and Elevate make **real Grok calls**, all through one adapter. Tests may use recorded cassettes; the product never fakes the model.
- The Guide's own app gets an **agency-grade Don't Panic design system**.
- Integrations (deploy, Pinterest, 3D sourcing, tools and MCP discovery, Imagine assets) are **real adapters, not stubs**.

## D-004 Interview depth (2026-10-06)

- There are three modes: Express, Standard and Deep. **Deep is the default** and the recommended mode.
- Express and Standard **drop no questions**. They defer questions or Suggest answers, and those answers are flagged for review.
- The Guide pushes back **twice** on vague answers before accepting them and recording the assumption.

## D-005 AntiHero prompts (2026-10-06)

- Matt's AntiHero prompts may be used **word for word with credit**. His guide PDFs stay in the repo under `context/sources/`.

## D-006 Lighthouse gate (2026-10-06)

- Lighthouse is measured on **real mobile tests** of what a phone actually gets. **All four scores (performance, accessibility, best practices, SEO) must be at least 90.**

## D-007 Upscaling (2026-10-06)

- Image upscaling stays **on** (Real-ESRGAN or similar). Weights download at first use and are never committed.

## D-008 Locked motion toolkit (2026-10-06)

- The toolkit is GSAP (base), Three.js, raw WebGL/GLSL, Motion, anime.js, Theatre.js (core only), Lenis, CSS scroll-driven animations and vanilla JS, chosen per effect. This restates D-001. There is no GSAP licence discussion anywhere in the plan or the product.

## D-009 Build orchestration (2026-10-06)

- The plan is built prompt by prompt by `.hh-driver/run-build.ps1`. Each prompt runs in a fresh headless Grok session on the default kr8tivai login, with model `grok-4.7` and the prompt's own effort tag. The driver verifies a commit after each prompt and pushes to `origin main` after every checkpoint.
- The driver pauses between prompts while `.hh-driver/PAUSE` exists. On a stall that survives one retry, or on the usage limit, it stops and writes `.hh-driver/BLOCKED.md`.
