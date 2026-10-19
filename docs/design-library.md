# Design library

The design library is build context for the desk. Gallery cards stay on the interview. Entries, technique notes, snippets, and context packs teach technique names, prompt vocabulary, and small working patterns. They are inspiration. Grok remixes them, adds its own idea, and does not reproduce an entry, a golden template, or a reference. No entry, tag, selector, pack, or prompt forbids a technique or a library.

The committed library is the human seed: **18 entries**, all `verified: human`, checked 2026-10-19. The target is about 2,000 entries. That growth is a manual ingest on this machine. CI proves the pipeline with fixtures and does not run ingest. Progress: 18 of about 2,000. Pipeline run count: 0.

Schema: `packages/knowledge/design-library/SCHEMA.md`.

## Add, verify, refresh, retire

Add a public URL by hand:

```powershell
pnpm --filter @hitchhiker/knowledge run library:add -- https://example.com/
```

That command is manual. It asks the policy gate, then a Grok spec build (`grok-4.7-build-fast`, effort `xhigh`) writes our notes. It is not run by CI.

Grow or recheck the library:

```powershell
pnpm --filter @hitchhiker/knowledge run library:ingest
pnpm --filter @hitchhiker/knowledge run library:ingest -- --recheck
```

`library:ingest` is resumable. State is `design-library/ingest-state.json`. A finished or refused item is skipped. `--recheck` sends one conditional request per stored URL about once a month, updates `checked`, and sets `retired` after two failures. Retired entries stay on disk.

Verify the committed tree:

```powershell
pnpm --filter @hitchhiker/knowledge run validate:design-library
```

The validator checks schema, license allowlist, credit line, license text for borrowed code, the 80-line snippet cap, canonical-URL dedupe, technique notes, and `index.json`. It requires at least 12 human-verified entries. Screenshot sets under `design-library/shots/` are gitignored.

## Seed (18)

These are the first milestone and the pipeline's golden fixtures. Twelve come from pages opened on 2026-10-19. Six more cover worlds the twelve do not, still as our own notes. The only borrowed code is the Lenis ticker snippet, with its MIT license text and credit line.

| id | source | mode | why it is here |
| --- | --- | --- | --- |
| codrops-interlude | codrops | link-only | Astro page transitions. Opened. |
| threejs-home | official-docs | link-only | threejs.org. Opened. MIT project, notes only in the seed. |
| threejs-examples | three-showcase | link-only | Official examples. Opened. Shader and hover distortion vocabulary. |
| gsap-standard-license | official-docs | link-only | GSAP standard license page. Opened. Scroll film vocabulary. |
| lenis-smooth | direct | code | Lenis repository, MIT. Opened. Snippet `snippets/lenis-gsap-ticker/`. |
| motion-split | official-docs | link-only | Motion. Opened. Split-text reveal. |
| astro-images | official-docs | link-only | Astro images guide. Opened. |
| unicorn-faq | official-docs | link-only | Unicorn Studio FAQ. Opened. Prefer our own shader. |
| stitch | direct | link-only | Stitch. Opened. |
| framer-agents | direct | link-only | Framer agents. Opened. Layered parallax. |
| awwwards-sotd | awwwards | link-only | Sites of the Day index. Opened. Link only. |
| awwwards-sites | awwwards | link-only | Jury criteria page. Opened. Link only. |
| dark-luxury-grade | original-note | link-only | Dark luxury grade, written by us. |
| r3f-docs | official-docs | link-only | React Three Fiber island. |
| gsap-a11y | official-docs | link-only | Split text and reduced motion. |
| chrome-autoplay | official-docs | link-only | Scroll video and autoplay policy. |
| howler-sound | official-docs | link-only | Opt-in ambient sound. |
| astro-view-transitions | official-docs | link-only | View Transitions page change. |

Counts by mode: code 1, link-only 17, feed 0. Counts by style world: editorial 7, scroll-film 4, 3d-world 4, playful 2, minimal-luxury 1, brutalist 0.

Technique notes, each with prompt language, a perf cost, and a reduced-motion line: `three-hero`, `r3f-island`, `glsl-gradient-noise`, `image-distortion-hover`, `scrolltrigger-pin-timeline`, `split-text-reveal`, `lenis-smooth-scroll`, `layered-parallax`, `view-transitions`, `scroll-video`, `asymmetric-editorial-grid`, `typographic-scale`, `grain-and-grade`, `ambient-sound-toggle`.

## Candidates, not entries

`candidates.json` holds 11 link-only URLs for the pipeline. They are not seed entries. URLs, not invented: bruno-simon.com, lusion.co, activetheory.net, locomotive.ca, aesop.com, patagonia.com, kinfolk.com, linear.app, stripe.com, darkroom.engineering, resn.co.nz.

## Ingest stages

1. Discover candidates from the sources below and from `candidates.json`.
2. Policy gate `ingestPolicy(source, url, license, robots)` returns exactly one of `code`, `feed`, `link-only`, or `refuse`, with the reason stored.
3. Fetch only what the mode allows. User agent `HitchhikerGuideDesignLibrary/0.1 (design library ingest; respects robots)`. Multi-second per-host delay (2 seconds). Conditional requests, caching, and that host's robots.txt.
4. A Grok spec build reads only the allowed material and writes techniques, prompt language, notes, perf cost, reduced motion, moods, section types, libraries, and, in code mode, a small snippet.
5. Validate schema, license allowlist, credit line, license text, snippet size, canonical URL, near-duplicate techniques, and style-world quotas (no world above about a third once the library has a floor of 8).
6. Write the entry and rebuild `index.json`.

A refused item is recorded and not retried around the policy.

### Modes

`code` borrows genuinely open-source code with credit and the license text. SPDX allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0. GitHub license API (public REST, rate limits, the user's own `gh` login if present, no secret in the repo). Codrops demos only when the repo states an allowlisted license. Official Three.js examples (MIT), Motion examples (MIT), Astro and Lenis docs under their stated licenses. GSAP: read the license on GSAP's own page at ingest time. Where that page does not allow reuse, store a link and our notes. A repo with no license, a custom license, GPL, or AGPL is `link-only` at most. No GPL or AGPL text is stored.

`feed` reads sources whose terms allow it: `https://land-book.com/rss.xml` and `https://www.lapa.ninja/rss.xml` (titles, links, and designer credit only; re-read terms and robots at run time), plus public GitHub and npm registry APIs and a Codrops public feed where its terms allow. A feed item is a candidate. Its entry is `link-only` unless it also resolves to a repository on the code allowlist.

`link-only` stores a URL, our notes, and our own 1440 and 375 screenshots when robots.txt allows. Nothing else. Awwwards, Godly (`godly.website`, now `recent.design`), aura.build, Mobbin, Refero, The FWA, and CSS Design Awards are refused on the automated path and accepted only through `library:add`.

Always refused: scraping against stated terms or robots.txt; crawling Awwwards (`/feed` and `/gallery/` disallowed; terms forbid reuse); walking gallery sitemaps into a database; calling Siteinspire `/api/`; ingesting Mobbin or Refero content into a competing dataset; copying code, copy, fonts, or images from a live site that lacks an open-source license.

## Source terms (read 2026-10-19)

This is a record of the research pass, not legal advice. Re-read terms and robots at ingest time.

| Source | What we store | Record |
| --- | --- | --- |
| Awwwards | link-only via `library:add` | Terms forbid reuse of site material. Robots disallow `/feed` and `/gallery/`. https://www.awwwards.com/terms/ |
| Mobbin | link-only via `library:add` | Terms forbid a competing dataset. https://mobbin.com/terms |
| Refero | link-only via `library:add` | Terms forbid a competing dataset. https://doc.refero.design/legal/terms-of-use |
| Godly / recent.design | link-only via `library:add` | godly.website redirects to recent.design. No terms page was found. |
| aura.build | link-only via `library:add` | Showcase links only. Do not copy templates, skills text, or DESIGN.md files. |
| Land-book | feed, then link-only entries | RSS opened. Credit the designer and link the entry. https://land-book.com/rss.xml |
| Lapa Ninja | feed, then link-only entries | RSS opened. Do not redistribute the gallery. https://www.lapa.ninja/rss.xml |
| Codrops | code when MIT is stated, else skip | Downloadable demos are MIT unless a demo says otherwise. https://tympanus.net/codrops/licensing/ |
| Siteinspire | refuse `/api/` | Robots disallow `/api/`. |
| The FWA | link-only | Homepage and terms bodies were empty on the research pass. Stay link-only until terms can be read. |
| CSS Design Awards | link-only | Terms returned 403. Stay link-only until terms can be read. |
| Three.js, Motion, Astro, Lenis | code when the stated license is on the allowlist | three LICENSE is MIT. Motion is MIT. Lenis is MIT. |
| GSAP | link and notes unless the page read at ingest time allows reuse | https://gsap.com/community/standard-license/ |

Run counts this checkpoint: seed 18, ingest 0, recheck 0, feed items stored 0.

## Context packs

Packs under `packages/knowledge/packs/` pin APIs past Grok 4.7's May 2026 cutoff. Each note is in our own words, with one official link. Docs are linked, not vendored. Frontmatter: `name`, `version`, `license`, `docs`, `llms`, `checked`, plus `description`, `when-to-use`, and `paths`.

Versions checked 2026-10-19 against npm latest at write time: Astro 7.4.1 (`llms: none`), GSAP 3.15.0 (`https://gsap.com/llms.txt`), three 0.186.1 (`https://threejs.org/docs/llms.txt`), `@react-three/fiber` 9.8.2 (`https://r3f.docs.pmnd.rs/llms.txt`), drei 10.7.9 (`llms: none`), motion 14.4.0 (`https://motion.dev/llms.txt`), lenis 1.3.27 (`llms: none`), howler 2.2.4 (`llms: none`). Node, vanilla, and GLSL are `version: built-in` and are not registry-checked.

```powershell
pnpm --filter @hitchhiker/knowledge run library:packs-check
```

That command is manual. Unchanged versions do nothing. A minor or patch writes a review note. A major sets `stale: true`, and `designLanguageFor` stops injecting that pack until it is re-read. Context7 tools `resolve-library-id` and `query-docs` are the live lookup for a stale pack. Their dumps are not copied into prompts.

Selection is keyword ranking on the prebuilt index. There is no vector store.

## Brand kit

The interview stays one flow. Existing answers become `.hitchhiker/brand/BRAND.md` and `src/data/brand.ts`: offer, logo direction, palette with contrast pairs, type, imagery and the Imagine prompt stem, motion, voice, and references. Palette pairs are checked against WCAG 2.2 SC 1.4.3 (4.5:1 body, 3:1 large). A skipped colour answer uses the default palette. The brief page shows the kit. Art direction and the asset step read it.

## Video, sound, and Imagine

Stills and video use the user's existing Grok login. Order, chosen in settings: Grok CLI `features.image_gen` and `features.video_gen` (no API key), then the opt-in embedded browser on a profile in `.hitchhiker/browser-profile` (the owner signs in; the desk does not read cookies), then an optional keychain API key labelled billed per use. The desk does not move to the billed key on its own. With no provider the item is blocked and no TODO slot is written.

A hero film or scroll film adds an Imagine video slot with no quote and no confirm. The file is saved when it is ready. Decorative video sets `generate_audio` false. The credit line is "Concept video, generated with Grok Imagine". If video is unavailable, the page keeps stills and motion.

Ambient sound is off unless the brief opts in. The control is visible, labelled, and keyboard reachable. It starts muted. The choice is remembered in `localStorage` and the control says so. Reduced motion does not start sound unless the visitor turns it on.

## Benchmark

`bench/visual/` is not part of `pnpm -r test`. Briefs: `briefs/paradise.md`, `briefs/bold-tech.md`, `briefs/playful-retail.md`. The runner exits unless `--run` is passed. It is Matt's call after review. Do not scrape aura.build. A hand export goes in `bench/visual/aura/`. Pass means, on every brief: pairwise vision prefers the desk page over plain Grok at 375 and 1440 in both orders; beauty richness is at least 9 of 10 in every section and at least 3 above plain Grok's mean; the richness index is at least 10 times plain Grok; originality is at least 8 of 10 and at least 4 above plain Grok's mean; the clone detector finds no template clone; the three desk pages differ. Against aura.build the desk is not lower on any rubric line and wins the pairwise judgement on at least two of three briefs. A tie fails. Results, when the runner is used, go to `bench/visual/results/<date>.md`.

## Parity with aura.build

Replicate the approach. Do not copy aura templates, components, skills text, DESIGN.md files, or assets.

Sources: https://www.aura.build , https://www.aura.build/ai-landing-page-builder , https://www.aura.build/design-systems , https://www.aura.build/skills , https://www.aura.build/create , https://www.aura.build/pricing , https://www.aura.build/learn/faq , https://www.aura.build/changelog , https://www.aura.build/aura-vs-lovable-vs-figma-make-vs-v0 , https://www.unicorn.studio/docs/embed/ , review https://www.youtube.com/watch?v=bHMgWFIXhMg .

| aura.build capability | How aura does it | Desk change |
| --- | --- | --- |
| Designed first generation | A pro template is chosen before the prompt | `BRAND.md`, art direction, 2-4 design library entries and generated assets travel in every prompt packet (239a items 2-4, items 1-2 here) |
| @ references (up to about 100,000 characters) | Templates, components, snippets, prior turns pulled in by `@` | `designLanguageFor` inlines brand excerpt, pattern notes, technique notes, golden example and asset paths; never proprietary templates |
| DESIGN.md systems (725 public on 2026-10-19) | Generated from a site or template: type, color, spacing, components, motion, WebGL and effects, guardrails | `BRAND.md` written from the interview, same headings, original (item 5) |
| Skills (193, for example Cinematic Scroll Storytelling, Scroll-Scrubbed Word Reveal) | Named notes referenced by `@` | Technique notes and pinned context packs selected per section (items 1, 3b) |
| Prompt builder controls (layout type, style, theme, type family, animation type, scene, easing) | Settings beside the prompt | The interview answers, translated per section (239a item 3) |
| Image generation (Nano Banana Pro, Ideogram, Flux 2 Pro, GPT Image) and a 30,000 image library | In-product generation and picker | Grok Imagine 2.0 stills and lite video on the user's own paid plan, automatic, saved at once, labelled (239a item 4, item 6) |
| WebGL backgrounds via Unicorn Studio or Spline embeds | Paste an embed URL | Our own shader or a small R3F island with a poster; a third-party embed only if the owner adds one and it is self-hostable |
| Design Mode and targeted edits | Click an element, edit one region | Beauty gate plus per-section remediation prompts, Elevate passes that may add (239a items 6-7) |
| Multi-page with transitions | Linked pages, named transitions | Astro pages and `<ClientRouter />` or View Transitions, Grok's choice |
| Model menu (includes Grok 4.7) | User picks a model | Fixed `grok-4.7-build-fast` xhigh; the packet makes up for the May 2026 knowledge cutoff |
| Export and publish | HTML, React, Figma, hosting | The Astro project is the export; deploy stays out of scope |
