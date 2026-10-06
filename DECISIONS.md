# DECISIONS (locked by Matt Haynes, product owner)

These override anything in CONTEXT-PACKAGE.md that conflicts. Treat them as locked decisions (Section 23: you may argue against one in CRITIQUE.md, but don't override it).

## D-001 Animation stack (2026-10-05)

Full list: GSAP, Three.js, raw WebGL/shaders, Motion (formerly Framer Motion), anime.js, Theatre.js, Lenis, CSS scroll-driven animations, vanilla JS.


- **GSAP is the locked default motion engine**, including ScrollTrigger and SplitText (all GSAP plugins ship free).
- **Drop the GSAP license concern entirely.** Remove §15.4 "GSAP license caveat" as a risk, remove open question §21 item 1 (GSAP license legal read) and the "MIT fallback" requirement that exists only because of it. Don't plan any work around replacing GSAP.
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
- The motion picker, motion spec, stack decision record, knowledge packs (motion, stack-usage-specs) and the build prompts must reflect this, including how the libraries coexist: one scroll source of truth (Lenis driving ScrollTrigger), one render loop shared by Three.js/Theatre.js/raw WebGL (one requestAnimationFrame ticker, ideally gsap.ticker), reduced-motion handling, mobile budgets, and each library's license.
