# 244d - Site copy: no fake .example contact address, no narration or robotic component microcopy, and the offer and disclaimer said once

## Context

Desk run 11 (project Run Eleven C, folder C:\Users\lucid\Desktop\desk-e2e-run11\site-c) finished every desk prompt and built dist (16 pages). The full review of dist found three copy problems that every generated site will repeat, because the engine neither asks the generated prompts to avoid them nor checks for them at close:

- BUG-125: an unset owner fact (the inquiry/contact email) rendered as a fake placeholder address. "Messages go to hello@paradisefound.example" is visible on farm pages and the contact form carries data-destination="hello@paradisefound.example"; 16 built pages contain "paradisefound.example". An unset owner fact must never become an invented address, phone number or URL (.example, .test, .invalid, example.com, 555 numbers and the like). The honest state is the existing missing-fact / missing-transport state (for a contact or inquiry form: the form is shown, says plainly that sending is not connected yet, and offers the next real step).
- BUG-126: component chrome speaks about the page or the spec instead of to the visitor. Examples from dist: footer "Read this line" / "The line is on this page."; language block "You can read this page in English or in Spanish. You stay on this page.", "English comes first. Spanish comes second.", "English. You are still on this page."; newsletter "One email, held here", "Hold this email", "Nothing has been held yet.", "This email stays on this page."; WhatsApp "This link does not say whether anyone is there now.", "A WhatsApp number is not listed on this page.", "Nothing has been opened."; farm page "What is known about this farm is written here.", "On a phone the save choice sits above the shortlist in one column.", "On this farm page, PF-001 is the only mark. Its place is not written here."; map caption "The top edge is ocean blue and the bottom edge is jungle green. They mark sea and land in general. They are not a pin."; "Choose the mark to read this farm."; "This shortlist stays on this browser. It is not sent. There is no members area." These read like layout notes or acceptance criteria turned into visible text. The visible-copy anti-slop scan misses them because they live in components and data the copy prompts did not own, and its narration patterns are too narrow.
- BUG-129: the offer paragraph and the full legal disclaimer repeat 3-5 times on each farm page (hero, cards, favorites, gallery, map, inquiry). The disclaimer belongs once in the footer and at most once near the inquiry form; the offer line belongs once per page.

Confirm this by reading how component and data jobs get their prompt text in `packages/engine/src/spec/site-prompts.ts` (follow `job(...)` and the authoring in `packages/engine/src/spec/author.ts`), the rules in `packages/engine/src/spec/site-rules.ts`, how missing owner facts are represented (MISSING-FACTS.md and the missing-fact patterns), the visible-copy judge `packages/engine/src/spec/visible-copy.ts`, the head check added in 244c (`packages/engine/src/spec/site-head.ts`), and the close flow in `packages/engine/src/guide/site-build.ts` with the owned-file and baseline logic from 244a/244b. If the real cause is different, fix that instead and say so in the commit body.

## Deliverables

1. Generated prompt text for every job that writes components, data or forms states plainly: an unset owner fact is never replaced by an invented address, number, domain or URL (name the reserved forms: `.example`, `.test`, `.invalid`, `example.com`/`example.org`, `555-` numbers); use the existing missing-fact state instead; a contact or inquiry form with no transport says sending is not connected yet.
2. Generated prompt text for every job that writes visible copy, including component chrome (footer, language switch, newsletter, WhatsApp, favorites/shortlist, map, gallery, filters, forms), states: speak to the visitor in calm, warm, plain sentences about what they can do; never describe the page, its layout, its colours, its position on screen, or what is "written here", "on this page", "held here", "not listed on this page", "is not a pin"; never restate a requirement as copy.
3. Generated prompt text for the farm/detail page and the shared layout states: the legal disclaimer appears once in the footer and at most once next to the inquiry form; the offer line appears once per page; other sections do not repeat them.
4. Engine close checks on dist, reusing the owned-file and baseline rules from 244a/244b/244c (an earlier prompt is not failed for a file it does not own; QA/launch prompts always check the whole site):
   a. a placeholder-contact check that fails with a bounded, labelled reason naming the file when visible text or a `href`/`data-*`/`action` attribute contains a reserved placeholder domain or number listed above;
   b. the existing narration patterns in `visible-copy.ts` widened to the phrase families above (page/line self-reference such as "on this page", "is written here", "held here", "not listed on this page", "you stay on this page", "you are still on this page", "comes first ... comes second", "is not a pin", "the top edge is", "read this line", "choose the mark to read"), extended in the existing list, not a second list; keep it precise enough that normal copy like "Ask about this farm" or "Photos coming soon" passes;
   c. a repetition check: on one built page, the same sentence of 12 or more words appearing in visible text more than twice fails, with the sentence clipped in the reason; the footer disclaimer plus one near the form is allowed.
5. Smallest change that fits the existing code; remove anything that becomes dead. Do not edit site-c or any generated site, and do not change app UI code.
6. Do not loosen or delete any existing assertion in any test or spec. Add new tests instead.

## Tests

In the engine unit tests:
- generated component/data/form prompt text contains the no-invented-contact rule with the reserved forms, and the not-connected-yet form state;
- generated copy prompt text for component chrome contains the speak-to-the-visitor / no-page-narration rule;
- generated farm page and layout prompt text contains the disclaimer-once / offer-once rule;
- placeholder check: dist text "Messages go to hello@paradisefound.example" fails and names the file; `data-destination="hello@paradisefound.example"` fails; `tel:555-0100` fails; a real-looking `hello@paradisefound.com` passes; a page with no address passes;
- narration check: each of at least eight BUG-126 sentences above fails; "Ask about this farm", "Photos coming soon", "Save this farm to your shortlist" and "Sending is not connected yet." pass;
- repetition check: a page with the same 14-word disclaimer three times fails; twice passes;
- a prompt that does not own the offending file is not failed; a QA/launch prompt is;
- the 244a/244b/244c owned-page, baseline and head tests still pass unchanged.

## Verification Gates

Run from the repository root:
- `pnpm --filter @hitchhiker/engine test`
- `pnpm typecheck`
- `pnpm lint`

## Commit

```
fix(engine): forbid invented contact placeholders, catch page-narration microcopy and repeated offer and disclaimer lines at close (244d)
```