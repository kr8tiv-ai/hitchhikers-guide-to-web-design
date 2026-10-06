---
id: "057"
kind: build
phase: babel-fish
slice: Hyperspace Bypass
title: "Grade uploads and upscale with Real-ESRGAN, weights fetched on first use"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["025", "053"]
files: ["packages/assets/src/grade.ts", "packages/assets/src/upscale.ts", "packages/assets/src/model-fetch.ts", "packages/assets/test/grade.test.ts", "packages/assets/test/upscale.test.ts"]
requirements: ["HH-ASSET-02"]
review_checkpoint_embedded: false
---

# 057. Grade uploads and upscale with Real-ESRGAN, weights fetched on first use

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

Score an image from facts you can measure: bytes, dimensions, and a caller-supplied sharpness number. Image upscaling is ON (Matt, D-007): low-resolution uploads are upscaled locally with Real-ESRGAN (or an equivalent ESRGAN-family runner such as the realesrgan-ncnn-vulkan release binary). The weights and runner are downloaded on first use into the user's home cache, verified by checksum, and never committed to the repo. Never replace a person, product, or place with an Imagine image unless the caller passes `yes: true`.

## Why this prompt exists

Soft photos sink an otherwise good site, and Matt wants upscaling on. Quiet replacement of a founder's face is still the failure mode, so replacement keeps its yes gate.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 9 collateral paragraph
- DECISIONS.md D-007 (upscaling on; weights downloaded at first use, not committed)
- context/research/07-3d-assets-open-source.md and context/research/06-library-stack.md (asset tooling notes)
- packages/engine/src/ingest.ts

## Files to create or change

- packages/assets/src/grade.ts
- packages/assets/src/upscale.ts
- packages/assets/src/model-fetch.ts
- packages/assets/test/grade.test.ts
- packages/assets/test/upscale.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

grade(facts) returns 1 to 10 and reasons. Under 512 on the long side caps the score at 4 and adds reason `short side or long side under 512`. upscalePlan(facts, yes) returns `{ action: 'skip' | 'upscale' | 'imagine-replacement', scale, reason }`. Upscale is chosen when the long side is under the slot's target (default 1920) and the image is not already sharp and large; scale is 2 or 4. Real subjects may be upscaled (it is the same photo), and the result is shown before/after with a "happy with this?" card. imagine-replacement is returned only when facts.subjectIsReal is false, or when subjectIsReal is true and yes is true. model-fetch.ts owns first-use download: ensureUpscaler({ cacheDir, fetchImpl, platform }) resolves the runner and weights under os.homedir()/.hitchhiker/models/realesrgan/, downloads from the official release URL listed in a constant manifest (url, sha256, licence) only if missing, verifies sha256, and records the licence text next to the files and in a CREDITS entry. runUpscale(input, output, scale, deps) spawns the runner with an injected spawn. Tests inject fetch and spawn; no network or GPU in CI. Do not commit .pth, .bin, .param, or .onnx files; .gitignore covers them.

## Interfaces and data shapes

```ts
export interface GradeFacts {
  width: number;
  height: number;
  bytes: number;
  sharpness: number;
  subjectIsReal: boolean;
}

export function grade(facts: GradeFacts): { score: number; reasons: string[] };

export function upscalePlan(facts: GradeFacts, yes: boolean, targetLongSide?: number): { action: "skip" | "upscale" | "imagine-replacement"; scale?: 2 | 4; reason: string };

export interface UpscalerManifestEntry { name: string; url: string; sha256: string; licence: string; platform: "win32" | "darwin" | "linux" | "any" }

export function ensureUpscaler(deps: { cacheDir: string; platform: NodeJS.Platform; fetchImpl: typeof fetch; manifest?: UpscalerManifestEntry[] }): Promise<{ runner: string; modelDir: string; downloaded: boolean }>;

export function runUpscale(input: string, output: string, scale: 2 | 4, deps: { runner: string; modelDir: string; spawnImpl: (cmd: string, args: string[]) => Promise<{ code: number; stderr: string }> }): Promise<void>;
```

## Steps

1. grade: score starts at 10. Subtract for long side under 512, bytes under 10kb, sharpness under 0.3. Clamp 1 to 10.

2. Test a 1x1 image scores at most 4.

3. upscalePlan on an 800 px wide product shot returns upscale with scale 4 to reach the target; a 1200 px image returns scale 2; a 2400 px sharp image returns skip with reason `already large enough`.

4. upscalePlan never returns imagine-replacement for a real subject without yes. Test it.

5. ensureUpscaler with an empty cache calls the injected fetch once per manifest file for the current platform, verifies sha256, writes under the cache dir, and returns downloaded true. A second call returns downloaded false without fetching.

6. A sha256 mismatch deletes the partial file and throws UpscalerChecksumError.

7. runUpscale passes `-i`, `-o`, `-s`, and the model dir to the injected spawn and throws with stderr on a non-zero exit.

8. A test scans the repo tree under packages/assets for weight file extensions (.pth, .bin, .param, .onnx) and fails if any is committed.

9. Export the functions from packages/assets/src/index.ts.

## Edge cases

- sharpness outside 0 to 1 throws.
- Offline on first use: ensureUpscaler throws UpscalerOfflineError with a one-line message, and the caller keeps the original image (never a silent failure).
- Score never returns 0 or 11.
- Windows paths with spaces are passed to spawn as separate args, never as one shell string.

## Acceptance criteria

- [ ] Upscaling is on by default and picks 2x or 4x from the measured size.
- [ ] Weights download on first use, are checksum-verified, and live in the home cache, not the repo.
- [ ] A real subject is never replaced without yes.
- [ ] A 1x1 score is at most 4.

## must_haves

truths:

- Upscaling is on and runs locally.
- Weights are fetched at first use and are not committed.
- Real subjects are not silently replaced.
- The grade is from measurements, not a vibe.

artifacts:

- packages/assets/src/grade.ts
- packages/assets/src/upscale.ts
- packages/assets/src/model-fetch.ts

key_links:

- grade can take ImageFacts from readImageFacts plus a sharpness input.
- upscalePlan feeds runUpscale, which uses ensureUpscaler's paths.

prohibitions:

- Do not commit Real-ESRGAN weights or runner binaries.
- Do not call Imagine inside upscalePlan.
- Do not raise the score of a tiny image because the brand is good.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/assets test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/057.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(assets): grade collateral and gate upscaling
```
