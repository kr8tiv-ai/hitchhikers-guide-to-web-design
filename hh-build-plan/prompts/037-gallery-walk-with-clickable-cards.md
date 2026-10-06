---
id: "037"
kind: build
phase: dont-panic
slice: Point-of-View Gun
title: "Gallery walk with clickable cards"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["029", "034", "035"]
files: ["packages/engine/src/gallery-walk.ts", "packages/engine/test/gallery-walk.test.ts", "packages/app/src/gallery/walk.ts", "packages/app/src/gallery/gallery.css", "packages/crawler/src/thumbnails.ts", "packages/crawler/test/thumbnails.test.ts", "packages/app/e2e/gallery-walk.spec.ts", "packages/app/src/server/routes.ts"]
requirements: ["HH-INT-06"]
review_checkpoint_embedded: false
---

# 037. Gallery walk with clickable cards

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

Build the gallery walk (Miro B3, Q9): clickable example-site cards with a screenshot, the link, and a one-line "look at…" note about the thinking. The user marks each card love, meh, or hate with a why. Rounds show 2 Godly and 2 Awwwards picks filtered by style world and industry (aura.build included where listed). The walk continues until about 10 likes, then narrows to a shortlist of 3 to 5 with reasons, and writes .hitchhiker/references/*.md.

## Why this prompt exists

Matt wants users to point at real award-level sites and say why, not pick adjectives. The why behind each like is the most useful taste data the Guide collects.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- context/matt-answers.md Q9 and Q37
- context/miro/03-interviews.png and CONTEXT-PACKAGE.md (v1) §8.1 box B3
- context/research/03-awwwards-anatomy.md and context/research/05-inspiration-galleries.md
- packages/crawler/src/galleries.ts (029) and packages/crawler/src/crawl.ts (026)
- packages/app/src/design/components.css (example-site card)
- context/matt-answers.md and DECISIONS.md (authority; they override this prompt)

## Files to create or change

- packages/engine/src/gallery-walk.ts
- packages/engine/test/gallery-walk.test.ts
- packages/app/src/gallery/walk.ts
- packages/app/src/gallery/gallery.css
- packages/crawler/src/thumbnails.ts
- packages/crawler/test/thumbnails.test.ts
- packages/app/e2e/gallery-walk.spec.ts
- packages/app/src/server/routes.ts

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

gallery-walk.ts is the state machine: rounds of 4 cards from suggestReferences (exclude seen urls), each card gets { verdict: love | meh | hate, why } with why required for love and hate (one gentle pushback if empty, then allowed blank); after 10 loves or 6 rounds the walk moves to narrowing, where the user picks 3 to 5 favourites and Grok (through 047's suggest/think path) summarizes the common thread; writeReferences writes one markdown file per shortlisted site plus references/INDEX.md with the thread. thumbnails.ts captures a 1280x800 above-the-fold screenshot with the 026 crawler (robots respected), caches it under os.homedir()/.hitchhiker/cache/gallery/<sha1(url)>.webp for 30 days, and returns a designed placeholder when capture fails. The UI (walk.ts) renders cards with 015 styles, keyboard support (L, M, H keys plus buttons), and opens the site in a new tab with rel=noopener.

## Interfaces and data shapes

```ts
export interface WalkState { round: number; seen: string[]; verdicts: Array<{ url: string; verdict: "love" | "meh" | "hate"; why: string }>; phase: "walking" | "narrowing" | "done"; shortlist: string[] }
export function nextRound(s: WalkState, pack: GalleryEntry[], q: { industry?: string; styleWorld?: string }): GalleryEntry[];
export function recordVerdict(s: WalkState, v: { url: string; verdict: "love" | "meh" | "hate"; why: string }): WalkState;
export function writeReferences(projectDir: string, s: WalkState, pack: GalleryEntry[], thread: string): Promise<string[]>;
export function captureThumbnail(url: string, deps: { crawl: CrawlLike; cacheDir: string; now: () => number }): Promise<{ path: string; placeholder: boolean }>;
```

## Steps

1. Write the walk state machine with tests for rounds, exclusion, the 10-love switch, and the 6-round cap.

2. Write captureThumbnail with cache and placeholder; tests inject the crawler and clock.

3. Write writeReferences; test that 3 shortlisted sites produce 3 files and an INDEX with the thread.

4. Build the card UI with 015 components and keyboard controls.

5. Add the /api/gallery routes to the server.

6. Write the Playwright e2e that walks a fixture pack to 10 likes and a 4-site shortlist at 375 and 1440.

## Edge cases

- A site blocks robots: show the card with the placeholder and a note, never bypass robots.
- Fewer than 4 entries match: fill from the nearest style world and say so.
- The user loves nothing after 6 rounds: move to narrowing with a gentle prompt to describe what was missing.

## Acceptance criteria

- [ ] An e2e walk reaches 10 likes and a 3 to 5 shortlist with reasons.
- [ ] references/*.md are written for the shortlist.
- [ ] Cards follow 015 styles at 375 and 1440.

## must_haves

truths:

- Taste is captured as reasons attached to real sites.
- Rounds balance Godly and Awwwards picks.
- Robots.txt is respected for thumbnails.

artifacts:

- packages/engine/src/gallery-walk.ts
- packages/app/src/gallery/walk.ts
- packages/crawler/src/thumbnails.ts

key_links:

- nextRound calls suggestReferences from 029.
- writeReferences output is read by Babel Fish and Deep Thought.

prohibitions:

- Do not bypass robots.txt.
- Do not hotlink third-party images into the user's site.
- Do not accept a love without asking why.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/engine test
pnpm --filter @hitchhiker/crawler test
pnpm --filter @hitchhiker/app exec playwright test e2e/gallery-walk.spec.ts
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/037.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(gallery): clickable gallery walk to a reasoned shortlist
```
