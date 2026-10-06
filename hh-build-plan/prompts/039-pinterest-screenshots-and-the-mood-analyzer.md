---
id: "039"
kind: build
phase: dont-panic
slice: Ford's Field Notes
title: "Pinterest, screenshots, and the mood analyzer"
tier: Gargle Blaster
effort: high
model: grok-4.7
depends_on: ["025", "026", "011"]
files: ["packages/crawler/src/pinterest.ts", "packages/crawler/test/pinterest.test.ts", "packages/engine/src/mood/analyze.ts", "packages/engine/src/mood/schemas.ts", "packages/engine/test/mood.test.ts", "packages/engine/test/cassettes/mood/README.md", "packages/engine/src/config.ts"]
requirements: ["HH-INT-08"]
review_checkpoint_embedded: true
---

# 039. Pinterest, screenshots, and the mood analyzer

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

Accept Pinterest boards and screenshots as taste input. By default the user drops exported images or screenshots; an opt-in, rate-limited Playwright capture of a public board is available behind a config flag (off by default). Grok vision reads mood images and font or site screenshots, asks or records a why per image (cap 5 in Deep), and produces 3 visual directions with palettes and type classes (Babel Fish module 04, Miro 1.4 and 1.5).

## Why this prompt exists

Many users already have a Pinterest board or a folder of screenshots. Reading them with vision turns a vague "I like this vibe" into palettes and type classes the brand modules can use.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/miro/01-brand-assets.png and CONTEXT-PACKAGE.md (v1) §8.1 boxes 1.4 and 1.5
- context/research/08-brand-intake-frameworks.md
- packages/engine/src/ingest.ts (025)
- packages/crawler/src/crawl.ts (026)
- packages/engine/src/ai/think.ts (017)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/crawler/src/pinterest.ts
- packages/crawler/test/pinterest.test.ts
- packages/engine/src/mood/analyze.ts
- packages/engine/src/mood/schemas.ts
- packages/engine/test/mood.test.ts
- packages/engine/test/cassettes/mood/README.md
- packages/engine/src/config.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

pinterest.ts: captureBoard(url, deps) only runs when config.integrations.pinterestCapture is true; it checks robots.txt, scrolls the public board with a 1.5 s delay between scrolls, caps at 60 pins, saves pin images at their displayed size under .hitchhiker/uploads/mood/, and never logs in or uses cookies. Otherwise the UI asks for exported images or screenshots. analyze.ts: analyzeMood(images, facts, depth) sends up to 12 images (5 asked-why in Deep) to think() with images attached and schema { perImage: [{ file, whatItSays, palette: string[], typeClass: string, why?: string }], directions: [{ name, palette: string[5], typeClasses: { display, text }, mood: string, references: string[] }] (exactly 3) }. Palette values are hex; a validator rejects non-hex and directions that repeat the same palette. Font screenshots get a typeClass (for example humanist sans, high-contrast serif, grotesk, slab) rather than a guessed font name.

## Interfaces and data shapes

```ts
export function captureBoard(url: string, deps: { crawl: CrawlLike; config: GuideConfig; sleep: (ms: number) => Promise<void> }): Promise<string[]>;
export interface MoodDirection { name: string; palette: string[]; typeClasses: { display: string; text: string }; mood: string; references: string[] }
export function analyzeMood(images: string[], facts: Facts, depth: "express" | "standard" | "deep", deps: { think: typeof think }): Promise<{ perImage: unknown[]; directions: MoodDirection[] }>;
```

## Steps

1. Add integrations.pinterestCapture (default false) to config.ts with a test.

2. Write captureBoard with the flag check, robots check, delay, and 60-pin cap; tests inject the crawler.

3. Write schemas.ts and analyzeMood with the hex and distinct-palette validators.

4. Record or hand-write cassettes for a 6-image fixture and test that exactly 3 directions come back.

5. Write the depth rule test: Deep asks why for up to 5 images; Express records none and marks the field ASSUMED.

## Edge cases

- Private or login-walled boards: return an empty list with a message asking for exported images.
- Images over 10 MB are downscaled before sending.
- Vision returns a font name: the validator converts it to a class and notes the guess.

## Acceptance criteria

- [ ] Cassette tests return 3 distinct directions with hex palettes.
- [ ] Board capture is disabled unless the config flag is true.
- [ ] Deep mode asks why for at most 5 images.

## must_haves

truths:

- Mood input becomes palettes and type classes through Grok vision.
- Pinterest capture is opt-in and polite.
- No login or cookies are used.

artifacts:

- packages/crawler/src/pinterest.ts
- packages/engine/src/mood/analyze.ts

key_links:

- analyzeMood output feeds Babel Fish palettes (049) and 088.
- captureBoard uses the 026 crawler.

prohibitions:

- Do not log in to Pinterest or store cookies.
- Do not capture when the flag is off.
- Do not guess exact font names as facts.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/crawler test
pnpm --filter @hitchhiker/engine test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/039.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(mood): Pinterest intake and Grok vision mood directions
```
## REVIEW CHECKPOINT

This build closes a review group. After this commit, the driver runs the fresh-session reviewer prompt `040-review-037-039.md` before the next build prompt. Do not start that review inside this session.

The reviewer covers:

- `037` Gallery walk with clickable cards (Point-of-View Gun, Heart of Gold, high)
- `038` Motion family previews and the 1–10 slider (Pan Galactic Gargle Blaster, Heart of Gold, high)
- `039` Pinterest, screenshots, and the mood analyzer (Ford's Field Notes, Gargle Blaster, high)

Policy the reviewer will apply: goal-backward check of each must_haves block, tests green, no files outside each prompt's file list, anti-slop and design-system check on any UI, desktop and mobile screenshots if a UI file changed. Auto-fix at most twice, then stop. The reviewer does not begin the next feature.
