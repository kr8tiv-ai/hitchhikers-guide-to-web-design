---
id: "025"
kind: build
phase: dont-panic
slice: Sub-Etha
title: "Ingest a brand PDF and grade an image file"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["006", "011"]
files: ["packages/engine/src/ingest.ts", "packages/engine/test/ingest.test.ts", "packages/engine/package.json", "NOTICE"]
requirements: ["HH-INGEST-01"]
review_checkpoint_embedded: false
---

# 025. Ingest a brand PDF and grade an image file

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

Extract text from a PDF with pdfjs-dist and record basic facts about an image. Do not shell out to pdftotext, poppler, or Homebrew. Mark imported guide text as IMPORTED when it fills an answer. Grade is metadata only in this prompt: bytes, width, height, and a warning if the longest side is under 512.
suggestAnswerPatches stays as the cheap path. Add importBrandGuide(text, pageImages, adapter) that sends text plus page images to Grok (011, structured output) to fill BRAND/VOICE fields marked IMPORTED, each followed by a "happy with this?" card. Tests use a recorded cassette.

## Why this prompt exists

Users arrive with a PDF brand guide and a logo PNG. The interview should accept those files on every OS without a native toolchain.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md section 7
- hh-build-plan/RESEARCH-ADDENDUM.md note on pdfjs-dist and the instruction to re-read the license at install
- packages/engine/src/interview.ts

## Files to create or change

- packages/engine/src/ingest.ts
- packages/engine/test/ingest.test.ts
- packages/engine/package.json
- NOTICE

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

Add pdfjs-dist only after you read its license from the registry or the installed LICENSE file and write a NOTICE line. If the license is not Apache-2.0, MIT, or BSD, stop and write the conflict in the summary. Do not switch to pdftotext. Pin the version you installed. extractPdfText(path) returns `{ text, pages }`. Cap text at 100,000 characters and set truncated true. For images, do not add sharp yet. Parse PNG IHDR and JPEG SOF for dimensions with a small reader. Unsupported types throw IngestError code UNSUPPORTED. A file over 25 MB throws TOO_LARGE before parsing. applyImport(sessionAnswers, extracted) is a pure function: if the text contains a line `Slogan:` the caller does not guess. This prompt only returns the text. A helper suggestAnswerPatches(text) looks for explicit labels `Slogan:`, `Colors:`, `Do not use:` and returns AnswerRecord patches with status IMPORTED for DP-1.3, DP-1.2, and DP-1.9. If a label is absent, it is absent. Do not infer a slogan from the first sentence.

## Interfaces and data shapes

```ts
export interface PdfExtract {
  text: string;
  pages: number;
  truncated: boolean;
}

export interface ImageFacts {
  bytes: number;
  width: number;
  height: number;
  warning: string | null;
}

export function extractPdfText(file: string): Promise<PdfExtract>;
export function readImageFacts(file: string): Promise<ImageFacts>;
export function suggestAnswerPatches(text: string): AnswerRecord[];
```

## Steps

1. Install pdfjs-dist with pnpm and record the exact version and license SPDX in NOTICE. Use the legacy build that works in Node, and disable the worker if the library requires a fake worker in Node. Keep the code in ingest.ts.

2. Write a one-page fixture PDF as a binary committed under packages/engine/test/fixtures/slogan.pdf. Generate it in the test setup with pdfjs is hard. Instead, commit a minimal PDF built as a string in the test file and written to the temp dir, containing the text `Slogan: Bring a towel` if your generator can. If generating a valid PDF in pure JS is too long, check in a tiny fixture you create with a short script run once, and commit the bytes. The test must fail if the slogan text is not extracted.

3. readImageFacts: implement PNG width and height from IHDR. A 1x1 PNG base64 fixture in the test returns 1 and 1 and warning because 1 < 512. JPEG may return UNSUPPORTED in this prompt if you document it. PNG is the acceptance test.

4. Reject paths outside an allowed root parameter. Signature: extractPdfText(file, opts?: { root?: string }). If root is set, the file must stay inside it after realpath. The test uses a temp root.

5. suggestAnswerPatches finds `Slogan: Bring a towel` and returns one IMPORTED record for DP-1.3 with that value. It does not create a testimonial.

6. 25 MB guard: pass a fake stat via injection `statImpl` so you do not create a 25 MB file. Default uses fs.stat.

7. No child_process import in ingest.ts. The test reads the source and fails if `pdftotext` or `child_process` appears.

8. Export the three functions from the engine index.

9. Do not upscale, do not call Imagine, do not modify the image.

## Edge cases

- Truncation sets truncated true and still returns the prefix.
- A missing file throws a named error.
- Label matching is case-sensitive on the labels in the prompt so `slogan:` in a paragraph does not import. Require the capitalised labels you documented, at line start.

## Acceptance criteria

- [ ] The fixture slogan is extracted without pdftotext.
- [ ] A 1x1 PNG warns.
- [ ] An explicit Slogan label becomes an IMPORTED patch and nothing else is invented.
- [ ] NOTICE records the pdfjs license you actually installed.

## must_haves

truths:

- PDF text extraction does not depend on a system poppler install.
- Imported fields are marked IMPORTED.
- Images are measured, not rewritten.

artifacts:

- packages/engine/src/ingest.ts
- NOTICE

key_links:

- suggestAnswerPatches emits AnswerRecord values the interview json can store.
- ingest.test.ts uses a PDF fixture and a 1x1 PNG.

prohibitions:

- Do not spawn pdftotext, sips, or ImageMagick.
- Do not invent brand fields that are not labelled.
- Do not send the PDF to an API.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/025.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(engine): ingest PDF text and PNG dimensions
```

