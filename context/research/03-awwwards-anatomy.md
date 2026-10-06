# 03 · Anatomy of award-winning sites (Awwwards / FWA / CSSDA / Godly)

Research date: 2026-10-05. The site examples were pulled from Awwwards' **Sites of the Year** page ([awwwards.com/websites/sites_of_the_year](https://www.awwwards.com/websites/sites_of_the_year/)). I opened each listed site's Awwwards page and recorded its destination URL and Awwwards technology/style tags. The trait analysis is my synthesis, grounded in those tags, Awwwards' published evaluation criteria, and the AntiHero guides (see 09).

## 1. How the juries actually score

- **Awwwards** ([evaluation system](https://www.awwwards.com/about-evaluation/)): **Design 40%, Usability 30%, Creativity 20%, Content 10%.** Each site goes to at least 18 jurors and the 3 scores furthest from the average are dropped. A score of 6.5+ earns an Honorable Mention, the top daily score wins Site of the Day, and SOTD sites scoring above 7 with the developer jury get a **Developer Award** (dev criteria include semantics/SEO, animations/transitions and markup). Site of the Month and Site of the Year are chosen from those winners. The Igloo Inc page shows a real scorecard: SOTD 7.92, Dev 7.66 ([awwwards.com/sites/igloo-inc](https://www.awwwards.com/sites/igloo-inc)).
- **Recent SOTYs:** **Lando Norris** by OFF+BRAND won Site of the Year 2025 plus the User's Choice award (Webflow + GSAP + WebGL per its tags; [landonorris.com](https://landonorris.com/)). **Igloo Inc** by abeto and Bureaux won Site of the Year 2024 and Developer Site of the Year ([igloo.inc](https://www.igloo.inc/)).
- **What this means for the product:** with Usability at 30%, a beautiful site that janks on a phone loses. Content at 10% is small but it's where AI slop gets caught. Our reviewer agent should score against the same four weights (Matt's Prompt 30 already does this).

Other venues: [CSS Design Awards](https://www.cssdesignawards.com/) (WOTD/WOTM), [The FWA](https://thefwa.com/) (long-running "FWA of the Day" for cutting-edge, often WebGL work), and [Godly](https://godly.website) (a curated gallery with Motion, 3D, Typography and Editorial filters). These are curated galleries, not juried awards.

## 2. Evidence: tag frequency across 31 Sites-of-the-Year entries

I counted Awwwards tags across the 31 sites on the SOTY page: **web-interactive 20, 3d 19, animation 17, webgl 14, storytelling 11, three-js 9, scrolling 8, e-commerce 7, transitions 6, gsap 6, typography 4, parallax 4, microinteractions 4, sound-audio 3, pixijs 3, glsl 3, unusual-navigation 3, 404-pages 4.**

Two things to take from that:
1. About 60% are tagged 3D and about 45% WebGL. At SOTY level, real-time graphics are the norm, not a gimmick.
2. "Storytelling" and "scrolling" sit alongside the tech tags. Winners use motion to *narrate*.

## 3. The common anatomy (synthesis)

1. **One signature moment.** Each winner has one thing people screenshot and share. Examples from the Awwwards descriptions: Messenger's small planet with character navigation and NPCs ("It's a small planet, but someone's gotta make the deliveries"), Opal Tadpole's "hand flip" element, and Lando's "dynamic interactions, bold visuals". Matt's Visual Interview Q8 ("the signature moment") encodes this.
2. **Scroll as timeline.** The page plays like a film the visitor scrubs: pinned sections, scroll-scrubbed video or canvas sequences, camera paths through 3D. Usually GSAP ScrollTrigger plus smooth scroll (Lenis, or Locomotive Scroll on older sites; Pangram Pangram is tagged `locomotive-scroll`).
3. **Typography as image.** Huge display type, tight tracking, line-by-line mask reveals (SplitText), deliberate scale contrast. Type-led winners include Pangram Pangram Foundry and Synchronized Studio.
4. **Considered preloader → intro.** Heavy WebGL sites hide asset loading behind a branded loader (a counter, logo animation or progress line) that hands off directly into the hero animation. The loader is part of the story, not a spinner.
5. **Page transitions.** No hard cuts. Persistent canvas or nav, with content morphing between routes (tag `transitions` on 6 of 31).
6. **Cursor and micro-interactions (desktop).** Custom cursors that react to targets, magnetic buttons, hover distortions, links that animate (`microinteractions`, `gestures-interaction`).
7. **Restrained palette, rich texture.** Usually 1 accent plus neutrals, with grain, noise, glass or shaders adding depth.
8. **Sound, opt-in.** Ambient audio toggles show up on immersive pieces (Dark: Netflix guide, Mammut, The New Mobile Workforce are tagged `sound-audio`), always user-initiated.
9. **Craft in the corners.** 404 pages (4 of 31 tagged), footers and menus get as much love as the hero.
10. **Performance engineering.** Developer Awards reward smooth 60fps animation, semantic markup and SEO. Winners compress assets (Draco/Meshopt/KTX2), cap pixel ratio, and serve stills on mobile (Matt's 3D prompt encodes exactly these rules).

**What winners avoid** (this maps to Matt's NO SLOP rules): purple-blue gradients, centered hero plus a blob, three icon cards, stock smiles, the default Tailwind look, identical section rhythm, invented testimonials.

## 4. Example sites, grouped by style (36)

All URLs were checked live today (HTTP 200) or taken from their Awwwards pages. Tags in brackets are Awwwards' own.

### A. Immersive 3D / WebGL worlds (motion appetite 9–10)
1. Igloo Inc ([igloo.inc](https://www.igloo.inc/)): SOTY 2024 and Dev SOTY [3d, transitions, infinite-scroll]
2. Messenger by abeto ([messenger.abeto.co](https://messenger.abeto.co)) [3d, three-js, webgl, websockets, games]
3. Bruno Simon portfolio ([bruno-simon.com](https://bruno-simon.com/)) [3d, three-js, games-entertainment]
4. Active Theory v4 ([activetheory.net](https://activetheory.net)) [webgl, glsl, three-js, transitions]
5. Lusion v3 ([lusion.co](https://lusion.co/)) [3d, animation, design-agencies]
6. Star Atlas ([staratlas.com](https://staratlas.com)) [three-js, gsap, storytelling]
7. The Cool Club x FWA ([fwa.thecoolclub.co](https://fwa.thecoolclub.co/)) [three-js, webgl, infinite-scroll]
8. Kode Sports Club ([kodeclubs.com](https://www.kodeclubs.com/)) [3d, three-js, fullscreen]
9. Umami Land ([awwwards.com/sites/umami-land](https://www.awwwards.com/sites/umami-land)) [360, 3d, webgl, illustration]
10. Nomadic Tribe by makemepulse ([2019.makemepulse.com](https://2019.makemepulse.com)) [webgl, storytelling, unusual-navigation]

### B. 3D product and brand hero (appetite 7–9)
11. Lando Norris ([landonorris.com](https://landonorris.com/)): SOTY 2025 [webgl, gsap, webflow]
12. Opal Tadpole ([opalcamera.com/opal-tadpole](https://www.opalcamera.com/opal-tadpole)) [3d, e-commerce, microinteractions, single-page]
13. MA ([matruecannabis.com](https://matruecannabis.com)) [three-js, glsl, react, e-commerce]
14. Mana Yerba Mate ([en.manayerbamate.com](https://en.manayerbamate.com/)) [3d, shopify, illustration]
15. Apple AirPods Pro ([apple.com/airpods-pro](https://www.apple.com/airpods-pro/)): the reference point for scroll-driven product storytelling

### C. Scroll storytelling / editorial narrative (appetite 6–8)
16. Persepolis Reimagined, Getty ([getty.edu/persepolis](http://www.getty.edu/persepolis)) [webgl, gsap, vue, data-viz]
17. Dark: Official Netflix Guide ([darknetflix.io](http://darknetflix.io)) [sound-audio, storytelling, webgl]
18. Orano ([orano.group/experience/innovation/en](https://www.orano.group/experience/innovation/en)) [three-js, parallax, transitions]
19. Pioneer: Corn Revolutionized by Resn ([cornrevolution.resn.global](https://cornrevolution.resn.global/)) [3d, scrolling]
20. The Other Side of Truth ([theothersideoftruth.com](https://theothersideoftruth.com)) [pixijs, gsap, nuxt, social-responsibility]
21. Mammut Expedition Baikal ([eiger-extreme.mammut.com](https://eiger-extreme.mammut.com)) [next.js, sound-audio, typography]
22. The New Mobile Workforce ([thenewmobileworkforce.imm-g-prod.com](https://thenewmobileworkforce.imm-g-prod.com/)) [three-js, sound-audio]
23. Don't Board Me ([dontboardme.com](https://dontboardme.com)) [storytelling, scrolling, colorful]

### D. Illustration and playful color (appetite 5–8)
24. KPR ([kprverse.com](https://kprverse.com/)) [storytelling, experimental, scrolling]
25. Chungi Folio ([chungiyoo.com](https://www.chungiyoo.com/)) [gsap, nuxt, microinteractions]
26. Simply Chocolate ([simplychocolate.dk](https://simplychocolate.dk)) [parallax, colorful, e-commerce]
27. koox ([koox.co.uk](http://koox.co.uk/)) [webgl, glsl, minimal, food]
28. Prometheus Fuels ([prometheusfuels.com](https://www.prometheusfuels.com/)) [webgl, filters-and-effects]

### E. Type-led / studio minimal (appetite 3–6)
29. Pangram Pangram Foundry ([pangrampangram.com](https://pangrampangram.com/)) [typography, locomotive-scroll, parallax]
30. Synchronized Studio ([synchronized.studio](https://synchronized.studio/)) [pixijs, typography, transitions]
31. Noomo Agency ([noomoagency.com](https://noomoagency.com)) [3d, scrolling, storytelling]
32. Frans Hals Museum ([franshalsmuseum.nl/en](https://www.franshalsmuseum.nl/en/)) [gsap, gallery, culture]

### F. The Aura Homes reference set (from Matt's *Websites on Autopilot* guide)
33. Edelschwarz ([edelschwarz.it](https://www.edelschwarz.it)): Awwwards Honorable Mention
34. The Floating Forest ([thefloatingforest.com.au](https://www.thefloatingforest.com.au/)): Awwwards Honorable Mention
(Lando Norris and Igloo Inc are also on Matt's list. I couldn't find an Awwwards page or a resolving URL for "Cozy Lake Cabin".)

### G. Studios to mine for patterns (live, verified)
35. [darkroom.engineering](https://darkroom.engineering), the team behind Lenis ([lenis.darkroom.engineering](https://lenis.darkroom.engineering))
36. Also live: [cuberto.com](https://cuberto.com), [locomotive.ca](https://locomotive.ca), [obys.agency](https://obys.agency), [dogstudio.co](https://dogstudio.co), [basement.studio](https://www.basement.studio), [immersive-g.com](https://immersive-g.com), [unseen.co](https://unseen.co), [aristidebenoist.com](https://aristidebenoist.com)

## 5. What this means for the app

- **Style presets = these groups.** The interview should offer A–E as "worlds" with 2–3 live examples each, then ask *what exactly* the user loves about each one (Matt's Q6).
- **Default motion budget per group:** A needs the R3F pipeline plus a loader and mobile fallback stills. B needs one GLB hero or an image-sequence. C needs pinned scroll scenes and scroll video. D needs SVG/Lottie/Rive plus color. E needs SplitText, Lenis and transitions.
- **Reviewer rubric:** Awwwards' 4 weights, plus "signature moment present?", "one wow per section?" and a mobile parity check.
- **Avoid copying.** Steal structure and principles, never assets or code (Matt: "steal the thinking, not the look"). Credit inspirations on /credits.
