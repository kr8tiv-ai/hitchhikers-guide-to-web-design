---
id: "050"
kind: build
phase: babel-fish
slice: Sens-O-Matic
title: "Write imagery rules and Imagine prompt stubs"
tier: Cup of Tea
effort: medium
model: grok-4.7
depends_on: ["049"]
files: ["packages/engine/src/brand/imagery.ts", "packages/engine/test/imagery.test.ts"]
requirements: ["HH-BRAND-05"]
review_checkpoint_embedded: false
---

# 050. Write imagery rules and Imagine prompt stubs

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

Write an imagery guide that says what to photograph, what never to generate, and a list of prompt stubs that name a model and a resolution without calling the API. People, products, and places the user already has are marked do-not-replace.

## Why this prompt exists

Imagine will fill holes. It must not quietly replace a real founder photo. The guide is the rule the asset prompt will enforce.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 9 and 15.5
- packages/engine/src/brand/tokens.ts
- hh-build-plan/RESEARCH-ADDENDUM.md section 4 for model names, not for calling them
- context/research/08-brand-intake-frameworks.md
- CONTEXT-PACKAGE.md (v1) sections 9.1–9.6
- context/sources/build-a-brand-from-scratch-with-ai.plain.txt (Matt's method; verbatim prompts allowed with credit, D-005)

## Files to create or change

- packages/engine/src/brand/imagery.ts
- packages/engine/test/imagery.test.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

buildImagery({ answers, palette }) returns markdown and an array of stubs `{ id, model, resolution, prompt, replacesReal: false }`. Default model id for stills is `grok-imagine-image`. Resolution string is `1k` unless DP-7.1 value contains `1080` or `cinematic`, in which case the stub still does not assume video. Stills stay stills. Every stub prompt includes the ink and paper words, not the hex only, plus `no text, no watermark, no logo letters`. If DP-1.9 protected list is non-empty, add a section Protected that quotes it. replacesReal is always false in generated stubs. A function assertNoRealReplacement(stub) throws if the prompt contains `replace the person` or `looks like the uploaded photo of`.

## Interfaces and data shapes

```ts
export interface ImageStub {
  id: string;
  model: string;
  resolution: string;
  prompt: string;
  replacesReal: false;
}

export function buildImagery(input: { protectedNotes: string; vibe: string; paletteName: string }): { markdown: string; stubs: ImageStub[] };
```

## Steps

1. Return between three and six stubs. Ids img-01 onward. Subjects come from a fixed rotation: place, material, tool, hand-without-a-face, detail. Do not generate a face stub.

2. Each prompt contains `no text` and the vibe string escaped of quotes.

3. Protected notes appear in the markdown. Empty protected notes produce `Nothing is marked protected yet.`

4. assertNoRealReplacement is called on each stub before return.

5. Test that a stub prompt does not include the word testimonial.

6. Test cinematic budget words do not switch the model to a video model. Model stays grok-imagine-image.

7. No fetch.

8. Export the functions.

9. Word the markdown without exclamation marks.

## Edge cases

- A vibe longer than 80 characters is clipped inside the prompt only.
- Zero stubs is a failure. Throw if the rotation is empty.
- replacesReal is a literal type false. Do not widen it.

## Acceptance criteria

- [ ] Stubs name a still model and a resolution.
- [ ] No stub asks to replace a real person.
- [ ] Protected notes are quoted or the empty sentence is present.

## must_haves

truths:

- Imagery stubs do not call Imagine.
- Faces are not in the default stub list.
- The still model is not swapped for video because the budget said cinematic.

artifacts:

- packages/engine/src/brand/imagery.ts

key_links:

- Stubs use model ids the Imagine client in a later prompt will price.

prohibitions:

- Do not call the Imagine API.
- Do not write a prompt that recreates an uploaded person's face.
- Do not invent a testimonial image.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/050.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(brand): add imagery rules and prompt stubs
```
