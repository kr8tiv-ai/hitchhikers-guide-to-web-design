---
id: "085"
kind: build
phase: deep-thought
slice: Earth Mk II Blueprints
title: "3D sourcing: CC0 GLBs and Tripo/Meshy tools"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["073", "011"]
files: ["packages/assets/src/three-d/sources/polyhaven.ts", "packages/assets/src/three-d/sources/kenney.ts", "packages/assets/src/three-d/sources/quaternius.ts", "packages/assets/src/three-d/sources/ambientcg.ts", "packages/assets/src/three-d/sources/sketchfab.ts", "packages/assets/src/three-d/optimize.ts", "packages/assets/src/three-d/budget.ts", "packages/assets/src/three-d/generate.ts", "packages/assets/src/three-d/credits.ts", "packages/assets/test/three-d.test.ts", "packages/assets/package.json", "NOTICE"]
requirements: ["HH-3D-01"]
review_checkpoint_embedded: false
---

# 085. 3D sourcing: CC0 GLBs and Tripo/Meshy tools

## RULES

You are Grok 4.7 in Grok Build, building The Hitchhiker's Guide to Web Design. This prompt builds the Guide app itself, not a client's website.

- TypeScript strict. No `any` unless a line in this prompt names the exception and the reason.
- Tests ship with the behavior. Run the verification commands before you finish.
- No secrets in source, fixtures, logs, or commits. Keys come from the environment or the OS keychain.
- MIT-compatible dependencies only. Before adding a package, check the registry: exact name, license field, repository URL, and that the repo is the project you meant. Record the result in NOTICE. GPL and AGPL are out. Apache-2.0, BSD, ISC, MIT, Unlicense, Zlib, and MPL-2.0 (file-level, noted in NOTICE) are allowed. Font files may be SIL OFL-1.1. Media assets (models, HDRIs, textures, images) may be CC0 or CC-BY-4.0 with a CREDITS.json entry.
- Do not bundle `@theatre/studio` (AGPL-3.0). Theatre runtime means `@theatre/core` only, pinned, never `@latest`.
- Motion toolkit (D-001): GSAP is the base engine (ScrollTrigger, SplitText, and the other free plugins), and Three.js, raw WebGL/GLSL (OGL or WebGL2), Motion, anime.js, Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS all ship. The picker chooses per effect. No replacement or fallback paths.
- One job. Do not implement the next prompt.
- The app UI obeys the anti-slop rulebook: no purple-to-blue gradients, no magnetic buttons, no default Tailwind indigo look, no lorem, no banned words in user-facing copy, no exclamation marks. App screens use the Guide design system in packages/app/src/design/ (tokens, type, motion, components). Never ship an unstyled or default-looking screen. The app must look agency-grade with Don't Panic energy.
- Windows, macOS, and Linux. Use `node:path` and `node:os`. No hardcoded POSIX paths. No required `pdftotext`, Homebrew, or apt.
- If a doc in the repo disagrees with this prompt, stop and write the conflict in the summary. Do not invent an API.
- Authority: context/matt-answers.md (Matt's 40 answers) and DECISIONS.md override everything, including this prompt and CONTEXT-PACKAGE.v2.md. CONTEXT-PACKAGE.md (v1) holds full detail where v2 says "as in v1". If this prompt contradicts Matt, follow Matt and record the conflict.
- Commit when the checks pass. Do not push. Do not create a GitHub repo. Do not deploy.

## Goal

Give Deep Thought real 3D options (Q19, research/07). Fetchers for Poly Haven, Kenney, Quaternius, ambientCG, and Sketchfab Creative Commons models (licence captured, CREDITS.json entry per asset), gltf-transform inspect and optimize (Draco or Meshopt), and a budget check against the motion plan. Tripo and Meshy wrapped as `generate_3d(prompt | image) → glb` with a cost preview, the cap, and a user yes. The Guide explains options a to f to the user in plain words.

## Why this prompt exists

A 3D moment is a signature of award sites, and Matt wants the Guide to source or generate it properly: licensed, credited, optimized for phones.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/research/07-3d-assets-open-source.md
- context/matt-answers.md Q19
- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 8.3 and 15
- packages/engine/src/spec/motion.ts (073)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/assets/src/three-d/sources/polyhaven.ts
- packages/assets/src/three-d/sources/kenney.ts
- packages/assets/src/three-d/sources/quaternius.ts
- packages/assets/src/three-d/sources/ambientcg.ts
- packages/assets/src/three-d/sources/sketchfab.ts
- packages/assets/src/three-d/optimize.ts
- packages/assets/src/three-d/budget.ts
- packages/assets/src/three-d/generate.ts
- packages/assets/src/three-d/credits.ts
- packages/assets/test/three-d.test.ts
- packages/assets/package.json
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Each source module has search(q) and download(id, dir) with an injected fetch, returning { file, licence: "CC0-1.0" | "CC-BY-4.0", author, sourceUrl }. Poly Haven and ambientCG have public APIs; Kenney and Quaternius are fetched from their published asset pages or GitHub mirrors where available (respect robots and terms). Sketchfab search is public; downloads need the user's own API token from env or keychain and only CC0 or CC-BY models are accepted. optimize.ts uses @gltf-transform/core and @gltf-transform/functions (MIT) with meshopt or draco encoders (MIT/Apache-2.0), texture resize to 2048 max, and writes .hitchhiker/assets/3d/<name>.glb. budget.ts checks triangle count, texture memory, and file size against the level ceiling from the motion plan (default phone budget 1.5 MB GLB, 150k triangles). generate.ts wraps Tripo and Meshy HTTP APIs (keys from env or keychain) with a cost preview, the shared dollar cap, and confirm before submit, polling until a GLB is ready. credits.ts appends to CREDITS.json and renders a credits page snippet. Options a to f: (a) no 3D, (b) CSS/2.5D fake, (c) CC0 model, (d) CC-BY model with credit, (e) AI-generated model via Tripo or Meshy, (f) commission a 3D artist.

## Interfaces and data shapes

```ts
export interface ModelHit { id: string; name: string; licence: "CC0-1.0" | "CC-BY-4.0"; author: string; sourceUrl: string; previewUrl?: string }
export function optimizeGlb(input: string, output: string, opts: { maxTexture: number; encoder: "meshopt" | "draco" }): Promise<{ bytes: number; triangles: number }>;
export function checkBudget(stats: { bytes: number; triangles: number; textureMb: number }, level: number): { ok: boolean; reasons: string[] };
export function generate3d(req: { prompt?: string; image?: string; provider: "tripo" | "meshy" }, deps: { confirm: (quote: { usd: number }) => Promise<boolean>; cap: number; fetchImpl: typeof fetch; key: string }): Promise<{ file: string; usd: number }>;
export function explainOptions(level: number): Array<{ id: "a" | "b" | "c" | "d" | "e" | "f"; title: string; plain: string; cost: string }>;
```

## Steps

1. Write each source module with injected-HTTP tests and licence capture.

2. Write optimize.ts with a tiny fixture GLB committed under test fixtures (CC0, credited).

3. Write budget.ts with tests at levels 6, 8, and 10.

4. Write generate.ts for Tripo and Meshy with cost preview, cap refusal, and confirm; injected tests only.

5. Write credits.ts and explainOptions.

6. Record every new package and licence in NOTICE.

## Edge cases

- A model whose licence is not CC0 or CC-BY is refused with the reason.
- Optimized file still over budget: suggest a poster fallback for phones.
- Provider API errors: no charge recorded, clear message.

## Acceptance criteria

- [ ] Injected-HTTP tests pass for every source and both generators.
- [ ] Licence and credit are recorded per asset.
- [ ] Budget checks run against the motion plan level.

## must_haves

truths:

- 3D assets are licensed, credited, and optimized.
- Generated 3D needs a cost preview and a yes.
- Phones get a budget, not a desktop scene.

artifacts:

- packages/assets/src/three-d/optimize.ts
- packages/assets/src/three-d/generate.ts
- packages/assets/src/three-d/credits.ts

key_links:

- checkBudget reads the level from MOTION.md (073).
- CREDITS.json feeds the site credits page.

prohibitions:

- Do not accept non-commercial or unknown-licence models.
- Do not submit a paid generation without a yes.
- Do not commit large GLBs to the repo.

## Verification

Run from the repo root:

```powershell
pnpm install
pnpm --filter @hitchhiker/assets test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/085.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(3d): licensed 3D sourcing, optimization, and Tripo/Meshy generation
```
