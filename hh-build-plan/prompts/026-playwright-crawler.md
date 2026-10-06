---
id: "026"
kind: build
phase: dont-panic
slice: Vogon Neighbors
title: "Crawl a public page with robots.txt and screenshots"
tier: Heart of Gold
effort: high
model: grok-4.7
depends_on: ["001"]
files: ["packages/crawler/src/robots.ts", "packages/crawler/src/crawl.ts", "packages/crawler/src/index.ts", "packages/crawler/test/robots.test.ts", "packages/crawler/test/crawl.test.ts", "packages/crawler/package.json"]
requirements: ["HH-CRAWL-01"]
review_checkpoint_embedded: false
---

# 026. Crawl a public page with robots.txt and screenshots

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

Fetch robots.txt, refuse a disallowed URL, and capture desktop and mobile screenshots plus a small HTML excerpt of a page that allows it. Tests use a local fixture server or injected fetch and an injected browser. The default crawl does not touch Godly or Awwwards.

## Why this prompt exists

Competitor research is part of the interview. A crawler that ignores robots.txt or only runs on one OS will poison the brand work and the license to operate.

## Read first

Read these before editing. They are the contract. Do not re-read the whole vendor tree.

- hh-build-plan/CONTEXT-PACKAGE.v2.md sections 7 and 21 (gallery crawling stays minimal)
- hh-build-plan/RESEARCH-ADDENDUM.md gallery section

## Files to create or change

- packages/crawler/src/robots.ts
- packages/crawler/src/crawl.ts
- packages/crawler/src/index.ts
- packages/crawler/test/robots.test.ts
- packages/crawler/test/crawl.test.ts
- packages/crawler/package.json

Do not modify files outside this list unless a test harness forces a one-line export, and then name that file in the summary.

## Context for a fresh session

robots.ts parses a minimal robots.txt: User-agent and Disallow. allowed(url, body, userAgent) returns boolean. User-agent `*` applies when no specific block matches. crawl(url, deps) checks robots first by fetching origin + `/robots.txt`. A 404 robots means allow. A disallow throws RobotsDenied and does not open the browser. Screenshots: two viewports, 1440x900 and 390x844. Extract title, meta description, h1 texts, and a text excerpt capped at 4,000 characters. Also return a stackHint string from a pure function sniffStack(html): `shopify` if the html contains `cdn.shopify.com`, `webflow` if it contains `webflow`, `next` if it contains `/_next/static`, otherwise `unknown`. Do not fingerprint more. Inject `browser` so tests do not download Playwright browsers if they are absent. The production factory createBrowser() may dynamic-import playwright and is not called by the unit test. If you add playwright as a dependency, record the license in NOTICE. Pin it. The unit test must pass without a browser download: pass a fake page object.

## Interfaces and data shapes

```ts
export function allowed(url: string, robotsBody: string, userAgent: string): boolean;

export interface CrawlResult {
  finalUrl: string;
  title: string;
  description: string;
  h1: string[];
  excerpt: string;
  stackHint: "shopify" | "webflow" | "next" | "unknown";
  screenshots: { desktop: Buffer; mobile: Buffer };
}

export function sniffStack(html: string): CrawlResult["stackHint"];

export function crawl(url: string, deps: { fetchImpl: typeof fetch; openPage: (viewport: { width: number; height: number }) => Promise<FakePage> }): Promise<CrawlResult>;
```

## Steps

1. Implement allowed(). A Disallow of `/` for `*` denies every URL on that host. A Disallow of `/admin` denies only paths under it. Empty Disallow allows.

2. crawl fetches robots.txt first. Non-200 other than 404 throws a network error after one try. No retries in a loop beyond that single 404-as-allow rule.

3. On allow, openPage twice, once per viewport. The fake page in the test returns a title, an html string with `/_next/static`, and a PNG buffer. Assert both viewports were requested and stackHint is next.

4. A robots fixture that disallows `/secret` makes crawl(`http://example.com/secret`) throw RobotsDenied. fetchImpl for the document must not be called. Count calls.

5. Cap excerpt at 4,000 characters in a pure function clip(text).

6. Refuse non-http(s) URLs. Refuse file: URLs.

7. User-Agent string is `HitchhikerGuideBot/0.1` and is passed to allowed and to the document fetch header.

8. Do not crawl a list of hosts. One URL in, one result out.

9. Export the functions from the crawler index. Add the package test script if it is still the stub from prompt 1.

## Edge cases

- robots.txt larger than 500 KB is treated as deny, so a hostile file cannot stall the parser. Test with a string of that length via a unit call on allowed's parser helper.
- Redirects: use the fake fetch, do not implement a redirect chain longer than 3. If the deps response says redirected five times, throw.
- Internationalized domain names are out of scope. The URL constructor must accept the input or you throw BAD_URL.

## Acceptance criteria

- [ ] Disallowed paths never call openPage.
- [ ] Both viewports are captured on an allowed page.
- [ ] sniffStack detects next, shopify, and webflow fixtures.
- [ ] The test suite does not need a Playwright browser install.

## must_haves

truths:

- robots.txt is checked before navigation.
- Desktop and mobile captures both exist.
- Godly and Awwwards are not default targets.

artifacts:

- packages/crawler/src/robots.ts
- packages/crawler/src/crawl.ts

key_links:

- crawl.ts calls allowed() before openPage.
- sniffStack is pure and unit-tested without a browser.

prohibitions:

- Do not ignore robots.txt.
- Do not crawl a search engine or a gallery in this prompt.
- Do not store cookies or login to a site.

## Verification

Run from the repo root:

```powershell
pnpm --filter @hitchhiker/crawler test
```

## Report back

Write `packages/engine/summaries/` only if this prompt says so. Otherwise put a summary of at most 150 words in the commit body and in `.hitchhiker-dev/summaries/026.md` if that directory exists. The summary names files changed, tests run, and anything assumed.

## Commit

```
feat(crawler): respect robots.txt and capture two viewports
```
