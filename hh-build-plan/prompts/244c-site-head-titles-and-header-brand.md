# 244c - Site shell: page titles carry the site name, meta descriptions are real lines, and the header always shows the brand and (on desktop) the nav

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c) finished every desk prompt and built dist (16 pages). A full review of dist found shell problems that every generated site will repeat, because nothing in the engine asks for or checks them:

- BUG-130: every `<title>` is the bare route title ("Home", "PF-001", "Farms"); the brand name never appears. The farm meta description is narration ("What is known about this farm is written here. PF-001.") and the eco page meta description is a missing-fact gap ("The method is not written yet."). In site-c, `src/data/seo.ts` builds descriptions from page copy lines and `src/layouts/Base.astro` prints the route title as-is, so whatever narration or gap sits in the copy line becomes the search snippet.
- BUG-124: at 1280px and 820px the fixed header shows no visible crescent mark or wordmark (only a stray glyph top-left), the nav collapses to a "Menu" button even at 1280px although `src/components/Nav.astro` says only "under 1024px" collapses, and on farm pages the outlined "Contact" action is clipped to "ontact". `src/components/Logo.astro` is a large centred lockup section (28rem wide, sand background, 40px padding) that does not fit a 56px bar.

The engine only gives the nav job the title "Add the site nav from the route module." (`packages/engine/src/spec/site-prompts.ts`, REQ-NAV) and the SEO gate job "Check unique titles, meta, one H1, ..." (REQ-GATE-SEO). Neither says titles need the site name, that a description may never be narration or a missing-fact line, or that the bar must show the logo and keep the links inline on desktop. The engine's close checks (`packages/engine/src/spec/visible-copy.ts` and the site-build close flow in `packages/engine/src/guide/site-build.ts`) scan visible copy but not `<title>` / meta description quality.

Confirm this by reading the REQ-NAV, REQ-GATE-SEO and the layout/route job definitions in `site-prompts.ts`, how a job title becomes the desk prompt text (follow `job(...)` and the authoring in `packages/engine/src/spec/author.ts`), `packages/engine/src/spec/site-rules.ts`, `design-outputs.ts` (the site name is derived there) and the visible-copy judge. If the real cause is different, fix that instead and say so in the commit body.

## Deliverables

1. The generated nav/layout prompt text (REQ-NAV and whichever job owns the base layout head) states plainly: the bar shows the logo mark and the wordmark (sized for the bar, not the full lockup section) at every width; from 1024px up every nav route shows inline and nothing is hidden behind a Menu button; below 1024px the bar keeps the logo and a Menu button; no link or action may be clipped or overflow the bar at 1280, 1024, 820 and 390px.
2. The generated SEO/layout prompt text states: each `<title>` is "<page title> | <site name>" (the home page may be "<site name> | <short promise>"), unique per path; each meta description is a real, calm sentence for that page written for the visitor, never narration about the page ("is written here", "this page", "is not here yet"), never a missing-fact line ("not written yet", TODO), never empty. Use the site name the engine already derives; do not hardcode Paradise Found.
3. An engine close check on dist head: for any prompt that writes the layout or SEO data, and always for QA/launch prompts, the close flow fails with a bounded, clearly labelled reason when a built page has a bare title (no site name), a duplicate title, an empty meta description, or a description that matches the existing missing-fact / narration patterns the visible-copy scan already uses (reuse them; do not invent a second list). Earlier prompts that do not own the head are not failed for it (same owned-file idea as 244a/244b; read how those decide ownership and baseline, and follow it).
4. The generated header gate (the brand or visual gate job that the site's tests are written from) asks for a test that, at 1280px, the logo mark and wordmark are visible inside the header and every nav link is visible and not clipped, and at 390px the Menu button is visible. Add this to the existing gate job's text; do not add a new job unless no existing gate job fits, and say which you chose.
5. Smallest change that fits the existing code; remove anything that becomes dead. Do not edit site-c or any generated site, and do not change app UI code.
6. Do not loosen or delete any existing assertion in any test or spec. Add new tests instead.

## Tests

In the engine unit tests:
- generated REQ-NAV prompt text contains the logo-visible, inline-from-1024px and no-clipping requirements;
- generated SEO/layout prompt text contains the "<page title> | <site name>" rule using the derived site name, and the real-description rule;
- head check: a dist page with title "Home" fails and names the file; "Home | Example Site" passes; two pages with the same title fail; meta description "The method is not written yet." fails; "What is known about this farm is written here." fails if the existing narration patterns cover it (if they do not, add that phrase family to the existing patterns and test it); a real description passes;
- a prompt that does not own the head is not failed by the head check; a QA/launch prompt is;
- 244a/244b owned-page and baseline tests still pass unchanged.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

```
fix(engine): require branded titles, real meta descriptions and a visible header brand and desktop nav, and check the built head at close (244c)
```