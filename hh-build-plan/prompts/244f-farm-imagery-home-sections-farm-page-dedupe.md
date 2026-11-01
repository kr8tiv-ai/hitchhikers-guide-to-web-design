# 244f - Farm imagery uses the owner's hero crop, the home page shows farm cards and path cards, and each farm page has one spec card and one inquiry form

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c) built dist (16 pages). The full review of dist found three structure problems that every generated site will repeat, because the engine's generated prompt text does not ask for the right structure and no close check catches the wrong one:

- BUG-127: farm cards and farm pages use a concept image (beach garden beds) captioned "This picture is a concept, not a real listing" instead of the owner's hero crop labelled "Photos coming soon", as the brief asks when real listing photos are missing. The farm gallery renders a large empty near-black box ("Photographs of PF-001 are not here yet", Previous/Next buttons for 1 of 1). When a listing has no real photos, its card and page must show the owner's supplied hero image (cropped to fit) with a small "Photos coming soon" label, and the gallery must not render at all (no empty box, no carousel controls for zero or one image).
- BUG-128: the home page "Farms" section has no cards, only the sentence "You can ask about PF-001 ... PF-005. Photos coming soon."; the "Farms, Live on the Land, or How Buying Works" section is a right-aligned bullet list of three links, and its heading reads like the brief's Motion line. The home page must show the farm cards (the same card component as the farms index, with the brief's gentle fade-in, respecting prefers-reduced-motion) and the three paths as three calm cards with a short line and a link each. Brief direction lines (Motion, Layout, Tone, etc.) must never become visible headings.
- BUG-131: one farm page has two "What we can say" blocks and two "Ask about this farm" sections, and the spec list shows the "Ask us" link as every value. Each farm page must have exactly one spec card (known values shown as values; missing values shown as "Ask us" once per missing row, not as a link repeated for every row) and exactly one inquiry form.

Confirm this by reading how page, component and data jobs get their prompt text in `packages/engine/src/spec/site-prompts.ts` (follow `job(...)` and the authoring in `packages/engine/src/spec/author.ts`), the rules in `packages/engine/src/spec/site-rules.ts`, how owner images and missing photos are represented in the brief/spec (search for hero, image, photo, concept, "coming soon"), the close checks in `packages/engine/src/spec/visible-copy.ts`, `packages/engine/src/spec/site-head.ts` and the 244d checks, and the close flow in `packages/engine/src/guide/site-build.ts` with the owned-file and baseline logic from 244a/244b. If the real cause is different, fix that instead and say so in the commit body.

## Deliverables

1. Generated prompt text for every job that writes listing cards, listing pages, galleries or image data states plainly: when a listing has no real photos, use the owner's supplied hero image with a "Photos coming soon" label; never use a stock, generated or concept image as a listing photo and never caption one "concept"; do not render a gallery, carousel or its controls when there are fewer than two real photos.
2. Generated prompt text for the home page job states: show the listing cards using the shared card component (with the brief's fade-in, honouring prefers-reduced-motion) and present the site's main paths as calm cards, not a bare link list; brief direction lines (Motion, Layout, Tone, Voice and similar labels) are instructions, never visible headings or copy.
3. Generated prompt text for listing detail pages and the components they use states: exactly one spec card and exactly one inquiry form per page; a missing value reads "Ask us" in its own row once; sections do not re-render a block another section already shows.
4. Engine close checks on dist, reusing the owned-file and baseline rules from 244a/244b/244c/244d (an earlier prompt is not failed for a file it does not own; QA/launch prompts always check the whole site), each failing with a bounded, labelled reason naming the file:
   a. concept-image check: visible text or alt/caption containing "concept, not a real listing" or a figure captioned as a concept on a listing card or listing page fails;
   b. empty-gallery check: a gallery/carousel element with zero or one image, or Previous/Next controls with "1 of 1", fails;
   c. duplicate-block check: on one built page, the same section heading of a spec or inquiry block ("What we can say", "Ask about this farm" or the page's own equivalents found by repeated identical h2/h3 text) appearing more than once fails, and more than one inquiry `<form>` on a listing page fails;
   d. home-listings check: if the site has listing pages, the built home page must contain at least one link to a listing page inside a card-like element (an `<article>` or element with a card class), not only plain text naming the listings.
   Keep each check precise so normal pages (a single gallery of several real photos, one form, a heading reused once in header and footer nav) pass.
5. Smallest change that fits the existing code; remove anything that becomes dead. Do not edit site-c or any generated site, and do not change app UI code.
6. Do not loosen or delete any existing assertion in any test or spec. Add new tests instead.

## Tests

In the engine unit tests:
- generated listing card/page/gallery prompt text contains the owner-hero-crop "Photos coming soon" rule, the no-concept-image rule and the no-gallery-under-two-photos rule;
- generated home page prompt text contains the listing-cards-with-fade-in and path-cards rules and the brief-direction-lines-are-not-copy rule;
- generated listing page prompt text contains the one-spec-card, one-inquiry-form and "Ask us" once-per-row rule;
- concept check: a card with caption "This picture is a concept, not a real listing" fails and names the file; a card with the hero image and "Photos coming soon" passes;
- gallery check: a gallery with one image and "1 of 1" controls fails; an empty gallery box fails; a gallery with three images passes;
- duplicate check: a farm page with two "What we can say" headings fails; two inquiry forms fail; one of each passes;
- home check: a home page that only says "You can ask about PF-001 ... PF-005" fails; a home page with farm cards linking to farm pages passes; a site with no listing pages is not checked;
- a prompt that does not own the offending file is not failed; a QA/launch prompt is;
- the 244a-244e owned-page, baseline, head, placeholder, narration and repetition tests still pass unchanged.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm --filter @hitchhiker/orchestrator test`
- `pnpm --filter hitchhikers-guide test`
- `pnpm typecheck`
- `pnpm lint`

If the golden-path towel sample or any cassette fixture trips a new check, fix the fixture so it is a correct example, never weaken the check.

## Commit

```
fix(engine): use the owner hero crop for listings without photos, show listing and path cards on home, and allow one spec card and one inquiry form per listing page (244f)
```