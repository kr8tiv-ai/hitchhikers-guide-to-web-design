# High-end language and skill packs

The desk adds precise creative-dev vocabulary to a section prompt when the brief asks for it. The notes are a starting point. Grok remixes them and may pick another library. No pack bans a technique or a library.

## Language pack

Files live in `packages/knowledge/language-pack/`. Each entry has a name, when to use it, parameter ranges, a small snippet, performance notes, a reduced-motion path, and a source line.

The prompt generator includes an entry when both of these are true:

- The motion score is 7 or higher for any WebGL entry. A score of 4 or lower never adds a 3D term, even if the brief says glass or bloom.
- The section's art direction triggers that entry. A 3D hero gets the camera path, the glass material, and the post chain. A text-led section gets typography and the line reveal. It does not get the WebGL entries.

The block is titled "High-end language" and is phrased as vocabulary, not an order.

## Skill packs

Files live in `packages/knowledge/skills/`.

| Pack | What it is for |
| --- | --- |
| `object-showcase` | Product or hero 3D: camera, light, materials, post |
| `scroll-choreography` | Pin and scrub, horizontal tracks, SplitText, snap, Lenis scrollTo, Three progress with maath damp, shared elements |
| `shader-recipes` | Transmission, dispersion, iridescence, grain, caustics |
| `post-processing` | EffectComposer chains |
| `locked-versions` | Library versions known to work together, with import lines |
| `case-studies/awwwards-sotd-breakdowns` | Ten public sites, with links and our notes |

Front matter on each file names the site types, the motion appetite, the section kinds, the techniques, and the versions. A version in a recipe matches `locked-versions`.

## @skill

A plan or a section prompt may contain `@skill:scroll-choreography` (or another pack name). Expansion inlines the pack while the token budget allows, about 1,600 tokens for the whole skill block. A pack that does not fit is left as the `@skill:` line plus `Read on demand:` and the path under `packages/knowledge/skills/`. An unknown name stays in the prompt and is reported as `Unknown skill: <name>`.

The planner adds the lines from the brand's motion score, the style world, and the section art direction. A calm score adds none. A high-appetite product hero adds the showcase packs. A text-led story adds scroll choreography.

## Where it lands

`designLanguageFor` writes the language block and the expanded skills into the design-language section of a desk prompt. `generateBriefPlan` appends the `@skill:` lines to that section's acceptance, which the rendered prompt keeps.

## DESIGN.md and motion.ts

The brand step writes `DESIGN.md` at the site project root: tokens, type scale, color, spacing, component rules, motion principles with exact durations, eases and distances, and signature techniques. The plan step writes `src/scripts/motion.ts`: typed GSAP, Lenis, and Three constants (scrub, damping, bloom, easings, durations, staggers, scroll scenes, and a reduced-motion map). Every build prompt names both paths. A page that animates without those constants is flagged. The numbers are a starting point. Any appropriate library may carry the work.

## Recipe checker

`checkRecipes` in `@hitchhiker/qa` reads a built page and reports:

- Lenis together with a CSS scroll timeline (two scroll owners)
- Lenis without `ScrollTrigger.update`, `gsap.ticker`, and `lagSmoothing(0)`
- a tween of width, height, top, left, margin, padding, or a similar layout property
- ScrollTrigger with no `refresh()` after fonts and images
- a horizontal `xPercent` track whose ease is not `"none"`
- ScrollToPlugin while Lenis is the scroll owner
- animation with no `prefers-reduced-motion` branch
- more than one WebGL context

`checkRecipeDir` walks a site and skips markdown, `node_modules`, and `.hitchhiker`. A clean pattern is not a ban on any library.
