# Live fix 005. DP-5.1: show where to find great sites

## Read first

- `interview/tree.yaml` DP-5.1 (around line 538) and DP-5.2 (the guided Godly/Awwwards walk)
- `packages/engine/src/interview/*` (how a question's fields are typed and loaded: `loadTree`, `Question`), `packages/engine/test/tree.test.ts` (tree contracts)
- `packages/app/src/card.ts` (`renderCard`), `packages/app/src/client/desk.ts` (`asQuestion` parses the session's question), `packages/app/src/card.css`, `packages/app/src/design/voice.md` (the Guide's voice)
- `packages/app/test/card.test.ts`

## Feature

When the Guide asks for three to five sites the person loves (DP-5.1), show a short "Where to look" list under the question with clickable links and one line each. Keep it light and in the Guide's voice. The list:

- Awwwards, https://www.awwwards.com, the daily award winners; bold, experimental work.
- Godly, https://godly.website, a hand-picked gallery of striking sites, filterable by type and motion.
- Land-book, https://land-book.com, landing pages sorted by industry and style.
- SiteInspire, https://www.siteinspire.com, calm, well-typeset sites by style and subject.
- Lapa Ninja, https://www.lapa.ninja, landing pages by category, good for one industry.
- One Page Love, https://onepagelove.com, single-page sites and portfolios.
- Httpster, https://httpster.net, fresh, opinionated design picks.
- Minimal Gallery, https://minimal.gallery, quiet, minimal sites.
- Mobbin, https://mobbin.com, real app and mobile screens for patterns.
- CSS Design Awards, https://www.cssdesignawards.com, judged winners with UI and UX scores.
- And: competitors and brands you already admire in your own industry.

Verify each URL's host is right (you may fetch the home page headlessly; if a site is gone, drop it and say so in the commit body).

## Spec

1. Add an optional `resources` field to the question schema (a list of `{ label, url, note }`), loaded and validated by the engine tree loader (https URLs only), carried through the session JSON, parsed by `asQuestion`, and rendered by `renderCard` as a small `<details open>` or list titled "Where to look" under the "why" line. Links open in a new tab with `rel="noopener noreferrer"`; text is escaped. The final "competitors" line has no link.
2. Put the list on DP-5.1 in `interview/tree.yaml` (and the cassette copy `packages/engine/test/cassettes/guide/tree.yaml` if tests compare them). Do not change the ask, the why, or the writes.
3. Check the page CSP (`routes.ts` SAFE headers) still allows this (plain external links are fine; no external images or scripts).
4. Mobile (375px) stays readable: the list wraps, no horizontal scroll.

## Tests

- engine: the tree loads with resources on DP-5.1; a non-https resource URL fails validation.
- app: `renderCard` for a question with resources renders each link with `target="_blank"` and `rel="noopener noreferrer"`; a question without resources renders exactly as before (existing card tests unchanged).
- desk: `parseSession` keeps resources.

## Run

`pnpm exec tsc -b`; with `$env:HH_CASSETTE='replay'`: `pnpm --filter @hitchhiker/engine test` and `pnpm --filter @hitchhiker/app test`. All exit 0.

## Commit

```
feat(interview): DP-5.1 shows where to find great reference sites
```
Do not push.
