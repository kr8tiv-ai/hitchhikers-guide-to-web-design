# 240r. Fonts: a pairing library the desk can actually ship

Date: 2026-10-19. Research only. No font files were downloaded into the repo.

The desk today deals six pairs from `packages/engine/src/brand/tokens.ts` (`TYPE_PAIRINGS`). Index 0 is Bebas Neue / Barlow. Index 1 is Space Grotesk / Inter. `TYPE_LICENSE` is one sentence for every family. This note replaces that thin list with pairs from artistic foundries, each with a license URL that was opened in this pass, and with a ship rule the 241 spec can encode.

## License classes (read these before any pair)

Three different "free" regimes showed up. They are not interchangeable.

**OFL-1.1.** The SIL Open Font License lets a person use, study, embed, modify, and redistribute the font software, including inside a website or an app, as long as the font is not sold by itself and reserved names are respected. Documents made with the font are not the font software. License text read at https://www.fontshare.com/licenses/sil-ofl and the usage FAQ read at https://openfontlicense.org/how-to-use-ofl-fonts (use on a website needs no extra permission; redistributing the font files means keeping the copyright and the license). A generated site that contains the woff2 must also contain that family's `OFL.txt`.

**ITF Free Font License (Fontshare closed source).** Fontshare's own families are freeware for personal and commercial use, and the license grants self-hosting with `@font-face` on the licensee's own site. The same page forbids giving the font files to anyone else. Extracted from https://www.fontshare.com/licenses/itf-ffl in this pass: the grant covers "personal or commercial purposes" and "CSS @font-face" on the licensee's own servers; then "The Font Software may not … be distributed … to any other person"; "You may not provide the Font Software directly to external designers, agencies, contractors"; "Any third party wishing to use the Font Software must obtain their own copy directly from Fontshare." The full FFL is longer than the clauses the fetch returned. Re-read the whole page before a spec vendors any file. Desk rule: the generator may name an FFL family and link its Fontshare page. It must not copy the woff2 into a client handoff or into this repo. The site owner downloads it.

**Pangram Pangram trial.** https://pangrampangram.com/pages/faq (page read this pass): "All of our fonts are free to try for personal use as long as it is not used in a commercial project." The homepage (https://pangrampangram.com/) says commercial licenses start at $40. Editorial New, Cirka, Mori, Agrandir, Neue Montreal and the rest of that catalogue are reference tastes, not shippable defaults. They stay out of `TYPE_PAIRINGS`.

Collletttivo, foundry-wide, read at https://www.collletttivo.it/licensing: personal and commercial use, modification, and redistribution are allowed; selling the fonts or re-licensing them is not. Credit the designer and the foundry. The Apfel Grotezk repo states OFL-1.1 in the GitHub license badge and in `LICENSE.txt`: https://github.com/collletttivo/apfel-grotezk. The catalogue index read at https://www.collletttivo.it/typefaces lists the families used below. Per-family `LICENSE.txt` still gets confirmed at install, which is the rule the typography pack already states.

Velvetyne: the Pilowlava page states "SIL Open Font License, Version 1.1" (https://velvetyne.fr/fonts/pilowlava/). The foundry download screen states commercial use and redistribution under the same license (https://www.velvetyne.fr/download/?font=feroniapi, rights block). Other Velvetyne faces are listed at the end as a shortlist whose own License line was not opened this pass.

Google families used below answered a CSS2 request on 2026-10-19 (a `@font-face` came back) or have an official description in `google/fonts`. They live under `ofl/` and the OFL terms above apply. This pass did not open every family's `OFL.txt`. The 241 spec confirms `https://github.com/google/fonts/blob/main/ofl/<folder>/OFL.txt` before vendoring. The CSS2 guide (https://developers.google.com/fonts/docs/css2) was read: request only the axes you use, set `display`, and `text=` can cut a file by up to 90% when the headline string is known.

Fontshare catalogue: `GET https://api.fontshare.com/v2/fonts` returned 100 families on 2026-10-19, 64 `itf_ffl` and 36 `sil_ofl`. x-height and cap height below are the upright regular (weight 400) `properties` from that payload. The ratio is x-height / cap-height, so a 1000 UPM face and a 2048 UPM face can be compared. No optical-size axis appeared on Fontshare families except Literata (`opsz`, `wght`).

Satoshi's CSS (`https://api.fontshare.com/v2/css?f[]=satoshi@400&display=swap`) lists a `.woff2` first, then woff, then truetype. That is the self-hostable file. Do not hotlink `cdn.fontshare.com` in a generated site. The Google CSS2 endpoint, called without a woff2-capable user agent, returned TTF. Google's technical note (https://developers.google.com/fonts/docs/technical_considerations) says the stylesheet is built for the user agent. Self-hosting an OFL family means subsetting the upstream TTF (or the UA woff2) into a woff2 the site owns. OFL allows that.

Uncut.wtf was not opened as a directory this pass. It aggregates other people's licenses. Do not ingest a face from it until that face's own license page has been read. Open Foundry (https://open-foundry.com/, homepage read) is a curated index. Its first screen also lists Inter, Roboto, Poppins, and Work Sans, which this note treats as overused. It is a directory, not a blanket license.

## How a pair earns a place

Two tests, both measurable later in computed style.

Classification contrast. A display serif against a text grotesque, a constructed display against a humanist text, or a superfamily used at two optical sizes. Two similar neo-grotesks at the same size look like a template. One family in two weights still counts as one family (`packages/knowledge/packs/typography/SKILL.md`).

x-height. When both faces appear near the same size, keep the x/cap ratios within about 0.08 of each other so mixed lines do not jump. When the display is at least three times the body, a wider gap is the point: the headline can be a poster and the text can stay a reader. Ratios below are from the Fontshare API unless marked "not measured."

Mood tags use the desk's `StyleWorld` in `packages/engine/src/spec/art-direction.ts` (`editorial`, `3d-world`, `playful`, `brutalist`) plus tone tags for briefs that are fashion, product, civic, or food.

`deal: default` means the interview may offer it when the mood matches. `deal: on-request` means the pair is legal and good, and it is also a face AI sites already lean on, so it is not the automatic pick.

## Overused defaults

Do not deal these as the brand face unless the person typed the name (the audit's rule). Evidence opened this pass, plus the faces the audit already named.

| Family | Why it is on the list | Source opened |
|---|---|---|
| Poppins | Fontshare's own about page calls it "incredibly popular" and "used on millions of websites." It is `sil_ofl` on Fontshare (x/cap 548/697 = 0.786) and still a default-looking geometric. | https://www.fontshare.com/about |
| Inter | `TYPE_PAIRINGS` index 1. Open Foundry's first screen lists it beside the other workhorses. Anthropic's frontend-design skill, quoted in `hh-harness-research-2026-10-19.md`, treats the generic UI kit as a tell. A mono label face is called out in that same skill. | `tokens.ts`; https://open-foundry.com/; harness note citing https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md |
| Roboto | Android's local UI face. The Chrome fallback article uses local Roboto as the Android fallback, which is correct for a fallback and wrong for a brand display. Open Foundry lists it. | https://developer.chrome.com/blog/font-fallbacks; https://open-foundry.com/ |
| Open Sans, Lato, Montserrat, Nunito | Montserrat and Nunito are in the Fontshare `sil_ofl` set (Montserrat x/cap 0.750). They are the Google Fonts generation everyone already has. Open Sans and Lato were not re-measured here; they stay on the list because the audit named them and because shipping them as a "curated" pair repeats the template look. | Fontshare API for Montserrat and Nunito; audit `hh-quality-gap-audit-2026-10-19.md` §2 |
| Bebas Neue | `TYPE_PAIRINGS` index 0. Fontshare `sil_ofl`, x/cap 700/700 = 1. A single-weight poster grotesque. Fine when someone asks for condensed caps. A poor automatic answer. | Fontshare API; `tokens.ts` |
| Playfair Display, Raleway | Long-standing "elegant serif + thin sans" template pair. Not re-measured in the API dump. Keep them off the default deal. | Audit §5 item 1; not re-fetched as specimen pages this pass |
| JetBrains Mono as a label face | Fontshare `sil_ofl`. The Anthropic skill treats a mono face for labels as an AI chrome tell. A mono is allowed when the brief is code. It is not a third family for eyebrows. | Fontshare API; harness note on the Anthropic skill |
| Arial, Helvetica, system-ui as the display | These are the metric fallbacks in the size-adjust recipe below. They are not a brand. | https://developer.chrome.com/blog/font-fallbacks |

Space Grotesk stays available (pair 18) and is tagged `on-request`. It is currently a default and it shows up on a lot of AI marketing pages. Plus Jakarta Sans (Fontshare `sil_ofl`, x/cap 0.720) is in the same watch bucket and is not given a pair.

Pangram families are excluded for the license, not because they look generic. Neue Montreal and Editorial New are excellent and they cost money.

## The pairs

Each rationale is the reason the two faces work together, not a slogan. Source URL is the family page or the catalogue record. License URL is the page that was read.

### Editorial and literary

**1. Boska / General Sans.** Display Boska, body General Sans. Indian Type Foundry. https://www.fontshare.com/fonts/boska and https://www.fontshare.com/fonts/general-sans. License ITF FFL, https://www.fontshare.com/licenses/itf-ffl. Ship: owner downloads. woff2: Fontshare CSS API (Satoshi verified; same API). Axes: both `wght`. x/cap 0.678 and 0.734. Boska is a high-contrast serif (category Serif, Display in the API). General Sans is a rationalist grotesque with a slightly larger x-height, so the text stays open while the headline keeps the thick-thin drama. The 0.06 gap is small enough for a caption set in the sans next to a serif lead-in. Mood: editorial, fashion. Era: contemporary classic.

**2. Sentient / Switzer.** https://www.fontshare.com/fonts/sentient and https://www.fontshare.com/fonts/switzer. ITF FFL. Axes `wght`. x/cap 0.733 and 0.781. Sentient's own story on Fontshare says it is "a serif family for texts intended for immersive reading." Switzer's story says it is a neo-grotesk "made for our time." Put Sentient on the essay and Switzer on the UI, or the reverse when the headline should feel Swiss and the body should feel like a journal. The larger Switzer x-height keeps interface labels from looking small next to the serif. Mood: editorial. Tone: magazine.

**3. Gambetta / Synonym.** https://www.fontshare.com/fonts/gambetta and https://www.fontshare.com/fonts/synonym. ITF FFL. Axes `wght`. x/cap 0.665 and 0.683. Gambetta is drawn for book text (diagonal stress, wedge terminals, oldstyle-friendly proportions). Synonym is a humanist sans with diagonal terminals and a moderate x-height, so the two share a calligraphic angle instead of one looking "old" and the other looking "app." Use Gambetta for the headline at display size and Synonym for the body, or Gambetta for long reading when the world is literary. Mood: editorial. Industry: publishing.

**4. Zodiak / Satoshi.** https://www.fontshare.com/fonts/zodiak and https://www.fontshare.com/fonts/satoshi. ITF FFL. Axes `wght`. x/cap 0.711 and 0.676. Zodiak is a contemporary serif with enough contrast to act as a title. Satoshi is a geometric grotesque with a calmer x-height, which is what you want under a lively serif so the paragraph does not compete. This is the fashion-magazine structure (display serif, quiet geometric) without a didone cliché. Mood: editorial, fashion.

**5. Gambarino / Author.** https://www.fontshare.com/fonts/gambarino and https://www.fontshare.com/fonts/author. ITF FFL. Gambarino is a single-weight serif (no axis). Author is `wght`. x/cap 0.743 and 0.739. The ratios match almost exactly, which is rare and is why this pair can share a line (a serif word inside a sans sentence) without a baseline wobble. Author's story says it is a humanist sans "optimised for use in modern publications." Gambarino carries the poster. Mood: editorial. Tone: precise, warm.

**6. Erode / Ranade.** https://www.fontshare.com/fonts/erode and https://www.fontshare.com/fonts/ranade. ITF FFL. Axes `wght`. x/cap 0.742 and 0.722. Erode is a serif with a tall x-height for its cap, so it stays readable when the headline is only moderately large. Ranade is a wide-ish grotesque. Together they feel like a food or travel journal rather than a tech landing page. Mood: editorial, playful. Industry: food, hospitality.

**7. Recia / Cabinet Grotesk.** https://www.fontshare.com/fonts/recia and https://www.fontshare.com/fonts/cabinet-grotesk. ITF FFL. Axes `wght`. x/cap 0.697 and 0.716. Recia is a contemporary serif (x-height a bit small, caps tall), Cabinet Grotesk is a compact grotesque. The contrast is classification, not proportion. Use Recia for the title and Cabinet for navigation and body. Mood: editorial. Tone: gallery.

**8. Bespoke Serif / Bespoke Sans.** https://www.fontshare.com/fonts/bespoke-serif and https://www.fontshare.com/fonts/bespoke-sans. ITF FFL. Axes `wght`. x/cap 0.723 and 0.723. Same ratio because they are one superfamily. This is the pair to deal when the brief wants quiet luxury and no costume change between headline and text. Bespoke Slab and Bespoke Stencil exist on the same license if a later section needs a third voice; the two-family cap means the site picks two, not four. Mood: editorial, fashion. Tone: quiet.

**9. Neco / Amulya.** https://www.fontshare.com/fonts/neco and https://www.fontshare.com/fonts/amulya. ITF FFL. Axes `wght`. x/cap 0.711 and 0.675. Neco is a soft serif. Amulya is a humanist sans with a slightly smaller x-height, so body text looks a little more bookish next to the serif. Good for a craft brand that is not trying to be a magazine. Mood: editorial, playful. Industry: craft, home.

**10. Rowan / Synonym.** https://www.fontshare.com/fonts/rowan and https://www.fontshare.com/fonts/synonym. ITF FFL. Axes `wght`. x/cap 0.701 and 0.683. Rowan is another text serif in the catalogue. Paired with Synonym it is a second literary option so the desk does not deal Gambetta on every "serif" brief. The proportions are close. Mood: editorial.

**11. Fraunces / Instrument Sans.** Fraunces description read at https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/DESCRIPTION.en_us.html. Instrument Sans returned from the CSS2 API. OFL-1.1, confirm `ofl/fraunces/OFL.txt` and `ofl/instrumentsans/OFL.txt` in https://github.com/google/fonts. Ship: bundle the subset woff2 plus the OFL file. Fraunces axes, from that description and from a CSS2 request `opsz,wght@9..144,400` that returned a face: `wght`, `opsz`, `SOFT`, `WONK`. Instrument Sans accepted `wdth,wght`. x/cap not measured from the binary. Fraunces is an old-style soft serif (Windsor, Souvenir, Cooper) whose softness and wonkiness are axes, so a food or craft brand can turn the ink up without swapping families. Instrument Sans is a plain contemporary grotesque, including a width axis, so the UI can go slightly condensed while the headline stays soft. Set `font-optical-sizing: auto` on the display and a fixed `opsz` near 144 for the hero. Mood: editorial, playful. Industry: food, craft. Era: early-20th-century manners, drawn now.

**12. Newsreader / Public Sans.** Newsreader CSS2 `opsz,wght@6..72,400` returned a face. Public Sans is Fontshare `sil_ofl`, x/cap 0.715 (UPM is large; the ratio is what matters). OFL. Newsreader is a news text face with an optical size, so the headline uses a high `opsz` and the body a low one if you ever set both in Newsreader. Public Sans is the UI grotesque (it was made for civic interfaces). The pair suits a journal, a studio notes page, or a public-interest brief. Mood: editorial, civic.

**13. Literata / Familjen Grotesk.** Both Fontshare `sil_ofl`. Literata axes `opsz`, `wght`, x/cap 0.714. Familjen x/cap 0.769, axis `wght`. https://www.fontshare.com/fonts/literata and https://www.fontshare.com/fonts/familjen-grotesk. OFL text: https://www.fontshare.com/licenses/sil-ofl. Literata was designed for long reading on screen and it has a real optical size, which almost nothing else in the free catalogue has. Familjen is a grotesque with a tall x-height, useful for navigation that must stay clear at 16px. Mood: editorial. Industry: publishing, education.

**14. Crimson Pro / Familjen Grotesk.** Crimson Pro is Fontshare `sil_ofl`, x/cap 0.733, axis `wght`. Same Familjen as pair 13. https://www.fontshare.com/fonts/crimson-pro. A garalde book face against a tall grotesque. Deal this when Literata would feel too contemporary and Fraunces too soft. Mood: editorial. Era: book.

### Fashion, sharp, film

**15. Clash Display / Satoshi.** https://www.fontshare.com/fonts/clash-display and https://www.fontshare.com/fonts/satoshi. ITF FFL. Axes `wght`. x/cap 0.737 and 0.676. This is the desk's current sixth pair, and it is a good one. Clash Display is a tight grotesque for headlines. Satoshi is the geometric text face. Keep it. Stop pairing it with Inter. The x-height gap is 0.06, acceptable. Mood: fashion. Tone: sharp. `StyleWorld` nearest: editorial or brutalist depending on the layout.

**16. Bodoni Moda / Instrument Sans.** CSS2 accepted `Bodoni+Moda:opsz,wght@6..96,400`. OFL, confirm `ofl/bodonimoda/OFL.txt`. A didone with an optical size against a neutral grotesque. This is the fashion pair when the brief actually wants high contrast and thin hairlines. Do not use it for body copy. Hairlines break on a phone if the weight stays at 400 below 32px, so the phone scale uses `wght` 500 or higher for any Bodoni under 48px. Mood: fashion. Era: modern didone.

**17. Melodrama / Supreme.** https://www.fontshare.com/fonts/melodrama and https://www.fontshare.com/fonts/supreme. ITF FFL. Axes `wght`. x/cap 0.730 and 0.697. Melodrama is filed as Sans, Display. Supreme is a plain grotesque. The display face does the costume; Supreme does the menu, the price, and the paragraph. Mood: fashion, playful.

**18. New Title / General Sans.** https://www.fontshare.com/fonts/new-title. ITF FFL. New Title's story: "a typeface family for film titles and credits," narrow, almost monoline. Axis `wght`. x/cap 0.761. General Sans x/cap 0.734. The compressed title face is the poster; General Sans is the readable UI so the site does not become a credit roll. Mood: fashion, 3d-world. Industry: film, music.

**19. Instrument Serif / Instrument Sans.** Both returned from CSS2. Instrument Serif came back as a single roman at weight 400 (no axis was requested and none is assumed). OFL, confirm `ofl/instrumentserif/OFL.txt`. One designer's roman and grotesque. This is the product-fashion pair: a little literary, mostly quiet, no costume. Use it when Bespoke would require an FFL download and the site must be bundled. Mood: editorial, product.

**20. Bevellier / Satoshi.** https://www.fontshare.com/fonts/bevellier. ITF FFL. Axis `wght`. x/cap 0.773. A display face with a tall x-height against Satoshi's calmer geometric. Deal it for a beauty or jewellery brief that wants an engraved headline and a normal shop UI. Mood: fashion.

**21. Stardom / Switzer.** https://www.fontshare.com/fonts/stardom. ITF FFL. Stardom has no variable axis in the API (single weight). x/cap 0.753. Switzer 0.781. A title-card display with a neo-grotesk underneath. One-weight displays are cheap to ship (one woff2) and they force the layout to use scale instead of a fake bold. Mood: fashion, 3d-world.

### Product and interface

**22. Switzer, one family.** Display at wght 600, body at wght 400, same family. ITF FFL. x/cap 0.781 at the regular, which is a large x-height and is what you want for a UI that is also the brand. Counts as one family. Mood: product. This is the answer when the brief says "Swiss" and does not ask for a serif.

**23. General Sans, one family.** Same logic. x/cap 0.734. The rationalist grotesque. Slightly less "Swiss manual" than Switzer, slightly warmer. Mood: product.

**24. Technor / Excon.** https://www.fontshare.com/fonts/technor and https://www.fontshare.com/fonts/excon. ITF FFL. Axes `wght`. x/cap 0.813 and 0.719. Technor's story says the sides are flat, the strokes are monoline, the spacing is tight, and it is "a little wide" with a tall x-height, drawn for display. Excon is the text grotesque that can survive at 16px, which Technor should not be asked to do. Mood: 3d-world, product. Tone: constructed.

**25. Nippo / Quilon.** https://www.fontshare.com/fonts/nippo and https://www.fontshare.com/fonts/quilon. ITF FFL. Axes `wght`. x/cap 0.775 and 0.789. Both tall. Nippo is filed as Display. Quilon's cap height is short (589) with a high ratio, so it is a compact text face. A technical brand can set Nippo on the hero and Quilon on the spec table. Mood: product, 3d-world.

**26. Space Grotesk / Archivo.** Both Fontshare `sil_ofl`. https://www.fontshare.com/licenses/sil-ofl. Axes `wght`. x/cap 0.699 and 0.767. Space Grotesk is geometric and a little awkward on purpose. Archivo is the workhorse grotesque with a taller x-height, so it can carry the UI. Tag `deal: on-request`. Do not let mood-index 1 keep landing here. Mood: product.

**27. Sora / Public Sans.** Sora is Fontshare `sil_ofl`, x/cap 0.732, axis `wght`. https://www.fontshare.com/fonts/sora. Public Sans as in pair 12. Sora is a contemporary geometric with enough personality for a product name, Public Sans is the duller and more readable UI face. OFL, so this pair can be bundled. Mood: product, civic.

**28. Syne / Spline Sans.** Syne CSS2 accepted `wght@400..800` and returned five static files in this UA. Spline Sans is Fontshare `sil_ofl`, x/cap 0.750, axis `wght`. https://www.fontshare.com/fonts/spline-sans. OFL. Syne is an art-school grotesque (wide, a bit naive). Spline Sans is the straight text face so the paragraph does not inherit the headline's quirk. Mood: playful, product. Industry: studio, education.

### 3d-world, poster, experiment

**29. Unbounded / Instrument Sans.** Unbounded CSS2 accepted `wght@200..900`. OFL, confirm `ofl/unbounded/OFL.txt`. x/cap not measured. Unbounded is a wide display grotesque. Instrument Sans keeps the body from also being wide, which is the usual failure when a display face is used everywhere. Mood: 3d-world, sport. Tone: poster.

**30. Bricolage Grotesque / Newsreader.** Bricolage CSS2 accepted `opsz,wdth,wght`. OFL, confirm `ofl/bricolagegrotesque/OFL.txt`. A grotesque that can change optical size and width for the hero, against a news serif for the story underneath. This inverts the usual "serif headline, sans body" and suits a studio whose writing is the serious part. Mood: 3d-world, editorial.

**31. Climate Crisis / Familjen Grotesk.** Climate Crisis CSS2 returned a single face. OFL, confirm `ofl/climatecrisis/OFL.txt`. The family is a display built around a year axis in the upstream design; this pass confirmed a face came back and did not exercise a custom axis. Treat extra axes as unverified until `ofl/climatecrisis/METADATA.pb` is read in the 241 spec. Familjen carries the text. The headline can be one word. Mood: civic, 3d-world. Industry: climate, public interest.

**32. Tanker / Cabinet Grotesk.** https://www.fontshare.com/fonts/tanker. ITF FFL. Tanker has no axis. x/cap 1.000 (x-height equals cap height). That is a poster, not a paragraph. Cabinet Grotesk at 0.716 does the reading. One file for the headline is a small byte cost. Mood: brutalist, 3d-world.

**33. Panchang / Clash Grotesk.** https://www.fontshare.com/fonts/panchang and https://www.fontshare.com/fonts/clash-grotesk. ITF FFL. Axes `wght`. x/cap 0.730 and 0.737. Almost the same ratio, different costume: Panchang is the sporty display, Clash Grotesk is the slightly quieter text grotesque in the same world as Clash Display. Mood: brutalist, sport.

**34. Array / Tabular.** https://www.fontshare.com/fonts/array and https://www.fontshare.com/fonts/tabular. ITF FFL. Array has no axis, x/cap 0.800. Tabular is `wght`, x/cap 0.731, and the name says what it is for: figures and UI. A data-heavy brutalist page can shout with Array and align numbers with Tabular. Mood: brutalist, product.

**35. Kihim / Gambetta.** https://www.fontshare.com/fonts/kihim. ITF FFL. Kihim is one weight, x/cap 0.668, category Display. The API story describes it as a grid of extreme angles, often illegible until the pattern resolves. Use it for a single word or a monogram. Gambetta (pair 3) is the body, because the experiment must not touch the paragraph. Mood: 3d-world, brutalist. Era: abstract, Nasreen Mohamedi, per the foundry story.

**36. Segment / General Sans.** https://www.fontshare.com/fonts/segment. ITF FFL. No axis. x/cap 1.000. A segmented display. General Sans reads. Same rule as Tanker: the poster face never becomes the body. Mood: brutalist, 3d-world.

**37. Pilowlava / Instrument Sans.** Pilowlava: https://velvetyne.fr/fonts/pilowlava/, OFL-1.1, designers Anton Moglia and Jérémy Landes. Two styles in the page (regular and atome). No variable axis stated on that page. x/cap not measured. It is cooled-lava geometry, right for a 3d-world hero word and wrong for a sentence. Instrument Sans is the bundled OFL body. The foundry asks for a credit. Mood: 3d-world.

**38. Aktura / Gambetta.** https://www.fontshare.com/fonts/aktura. ITF FFL. No axis. x/cap 0.614. Category in the API: Serif, Blackletter, Display. A blackletter or textured display for one title, Gambetta for everything a person must read. Era: historical costume on a contemporary text. Mood: editorial, brutalist. Do not set Aktura below 48px.

### Playful, food, rounded

**39. Bonny / Pally.** https://www.fontshare.com/fonts/bonny and https://www.fontshare.com/fonts/pally. ITF FFL. Axes `wght`. x/cap 0.742 and 0.746. The ratios match. Bonny is a soft serif, Pally is a rounded sans. A bakery, a children's museum, or a sunny retail brief can use both without a "kids font" for the body. Mood: playful. Industry: food, retail.

**40. Chillax / Synonym.** https://www.fontshare.com/fonts/chillax. ITF FFL. Axis `wght`. x/cap 0.726 against Synonym 0.683. Chillax is a rounded grotesque for the headline. Synonym keeps the paragraph adult. Mood: playful, product.

**41. Chubbo / Pally.** https://www.fontshare.com/fonts/chubbo. ITF FFL. Axis `wght`. x/cap 0.687. Chubbo is a chubby display. Pally (0.746) is round but still a text face. The body stays quicker to read than the headline. Mood: playful.

**42. Apfel Grotezk / Ortica.** Apfel: https://www.collletttivo.it/typefaces/apfel-grotezk and https://github.com/collletttivo/apfel-grotezk (OFL-1.1 badge and LICENSE.txt). Ortica: https://www.collletttivo.it/typefaces/ortica (Ben Bovani; Linear Light, Regular, Bold, and Angular Bold). Foundry license https://www.collletttivo.it/licensing. Apfel is a round neo-grotesque. Ortica Linear is a text serif (the specimen is set as herbalist body copy). Put Apfel on the display and Ortica on the essay, or Ortica Angular Bold on a single title and Apfel on the UI. x/cap not measured. Variable: Apfel's GitHub issue on google/fonts discusses static weights, not a shipped axis; do not claim a variable axis. Ortica's index line says 4 weights. Mood: playful, editorial. Industry: food, print. Era: contemporary Italian open source.

**43. Comico / Author.** https://www.fontshare.com/fonts/comico. ITF FFL. No axis. x/cap about 1.0 (the API x-height 717 sits on the cap height 713 because the face is caps). The story says it is comic lettering with a large alternate set, and that contextual alternates should be on. Use it for one exclamation-free shout (the desk's copy rules still ban "!"). Author is the publication sans. Mood: playful.

**44. Paquito / Pally.** https://www.fontshare.com/fonts/paquito. ITF FFL. Axis `wght`. x/cap 0.702. Category Serif, Slab. A soft slab for the headline, Pally for the rounded UI. Mood: playful, brutalist. Industry: sport retail, food.

**45. Hoover / Ranade.** https://www.fontshare.com/fonts/hoover. ITF FFL. Axis `wght`. x/cap 0.663. A slab with a smaller x-height against Ranade's open grotesque (0.722). Industrial and a bit warm. Mood: brutalist, editorial. Industry: manufacturing, coffee, tools.

**46. Trench Slab / Excon.** https://www.fontshare.com/fonts/trench-slab. ITF FFL. Axis `wght`. x/cap 0.791. A heavy slab with a tall x-height. Excon (0.719) reads. Mood: brutalist.

**47. Zina / Synonym.** https://www.fontshare.com/fonts/zina. ITF FFL. No axis. x/cap 0.724. A display face close to Synonym's ratio (0.683 is a little further, still under 0.08). Single-weight display, humanist body. Mood: editorial, playful.

**48. Sharpie / Alpino.** https://www.fontshare.com/fonts/sharpie and https://www.fontshare.com/fonts/alpino. ITF FFL. Both `wght`. x/cap 0.709 and 0.587. Alpino has the smallest x-height in the set used here. That is an oldstyle proportion. Use Alpino for text only, at 18px or larger, with line-height 1.5, because a small x-height at 16px looks faint on a phone. Sharpie is the display. The gap is deliberate and only works because the display is much larger. Mood: editorial. Era: bookish grotesque.

**49. Red Hat Display / Public Sans.** Red Hat Display is Fontshare `sil_ofl`, x/cap 0.716, axis `wght`. https://www.fontshare.com/fonts/red-hat-display. OFL. A slightly opinionated grotesque for titles, Public Sans for the civic UI. Mood: civic, product. Industry: public sector, health, education.

**50. Boxing / Switzer.** https://www.fontshare.com/fonts/boxing. ITF FFL. No axis. x/cap 0.695. A display with a lower x-height than Switzer's 0.781, so the poster face looks denser and the UI looks lighter. Mood: brutalist, sport.

The prose numbers 1–48 match the JSON ids. Pairs 49 and 50 are described below and left out of the JSON on purpose. The JSON array is the count that matters.

**52. Outfit is not given a pair.** It is Fontshare `sil_ofl` (x/cap 0.684) and it is everywhere in the 2024 geometric wave. Watch list, with Plus Jakarta Sans.

### Pangram reference pairs (do not ship)

These are here because the brief asked for the free tier and its limits. License read: https://pangrampangram.com/pages/faq. Personal projects, portfolios, and pitches only. A generated commercial site needs a paid license. Names are the ones Fonts In Use indexes under the foundry (https://fontsinuse.com/foundry/2187/pangram-pangram). Specimen pages were not opened, so there is no x-height and no axis claim.

**P1. Editorial New / a licensed body.** Editorial New is the display serif people mean when they say "fashion serif" in 2023–2026. If a client already owns the license, pair it with Satoshi or General Sans (the client supplies those files too if they are FFL). The desk does not download it.

**P2. Cirka / Mori.** Cirka is a display serif, Mori a text grotesque, in that foundry's catalogue. Same rule.

**P3. Agrandir / Telegraf.** Agrandir is the wide display, Telegraf the companion. Same rule.

## Type scale by world

The fixed scale in `packages/engine/src/spec/design-outputs.ts` is display 4.75rem, heading 2.5rem, title 1.5rem, body 1.125rem, caption 0.875rem. Display/body is 4.22. That contrast is a virtue. The failure is that every brief gets the same numbers, and the families are not written into DESIGN.md.

Use a modular ratio, named the way https://typescale.com/ names them, and fluid clamps the way https://utopia.fyi/type/calculator/ builds them. Body floor is 16px (the typography pack). Preferred body is 18px (1.125rem), which matches the current token. Line-height 1.45–1.6. Measure 45–75ch. Phone checks at 375, 390, and 430, which the pack already asks for and the screenshot list does not yet include.

| World | Ratio | Name | Display/body at the desktop ceiling | Phone note |
|---|---|---|---|---|
| editorial | 1.333 | perfect fourth | about 4.2, close to today's 4.75rem on an 18px body | Serif headlines go to optical size max or weight ≥ 500 under 48px |
| 3d-world | 1.414 | augmented fourth | about 4.5–5.5 | The hero word can be larger; the body never drops below 16px |
| playful | 1.25 | major third | about 3.0–3.5 | Rounded faces get soft at small sizes; keep body at 18px |
| brutalist | 1.5 | perfect fifth | about 5–6 | Poster faces (x/cap near 1) are one line, then the text face |
| product (tone, not a StyleWorld) | 1.2 | minor third | about 2.5 | UI needs less drama; weight contrast does the rest |
| fashion (tone) | 1.414 | augmented fourth | about 4.5 | Didone and hairline faces gain weight on small screens |
| civic (tone) | 1.25 | major third | about 3.0 | Public Sans or Familjen at 18px, line-height 1.5 |

Fluid recipe: min viewport 375, max 1440. `clamp(min, preferred, max)` where preferred uses the utopia formula (the difference in size over the difference in viewport). Write the chosen families and the ratio into DESIGN.md from `writeDesignMd`. `typeVoiceFor` in `art-direction.ts` can keep its sentence and gain the family names.

Gate, later, in computed style: at 375 and at 1440, display font-size / body font-size is at least the world's minimum (editorial 3.2, playful 2.6, brutalist 4, 3d-world 3.5, product 2.2). Body computed size ≥ 16px. Line-height between 1.4 and 1.6. A line of body text between 45 and 75 characters where the column is the reading column.

## Fallback metrics (size-adjust)

Read and used: https://developer.chrome.com/blog/font-fallbacks (Katie Hempenius). The descriptors are `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override`. They make a local face occupy the same box as the webfont so `font-display: swap` does not move the layout.

Chrome's recommendation in that article: Arial for a sans, Times New Roman for a serif, and a second face for Android because Arial is not there. Roboto is the Android local face. That is the one place Roboto belongs.

```css
@font-face {
  font-family: "Satoshi Fallback";
  src: local("Arial");
  size-adjust: 100%; /* replace with the measured ratio */
  ascent-override: 100%;
  descent-override: 20%;
  line-gap-override: 0%;
}
@font-face {
  font-family: "Satoshi Fallback Android";
  src: local("Roboto");
  size-adjust: 100%;
  ascent-override: 100%;
  descent-override: 20%;
  line-gap-override: 0%;
}
body {
  font-family: Satoshi, "Satoshi Fallback", "Satoshi Fallback Android", sans-serif;
}
```

The percentages above are placeholders. The article's equations are `size-adjust = avgCharacterWidth(web) / avgCharacterWidth(fallback)`, then the overrides divide the web font's ascent, descent, and line gap by `UPM * size-adjust`. Do not copy the Poppins example numbers onto Satoshi. Generate them per family.

Tools the article names: Fontaine (https://github.com/unjs/fontaine), Capsize (https://github.com/seek-oss/capsize), and the Google Fonts metric dataset (https://github.com/khempenius/font-fallbacks-dataset) for families that dataset covers. Next.js `next/font` does this when the stack is Next. The Vite and Astro templates need the same descriptors written by hand or by Fontaine. Metric overrides alone fix the line box. Adding `size-adjust` also fixes the width, which is what stops a headline from wrapping to a new line when the webfont arrives.

A fixed `line-height` is not a substitute. The article says so: line-height sizes the CSS line box and does not fix the font's own box.

Generate the overrides when the woff2 is subset, store them next to the family in the brand module, and assert in the type gate that every shipped `@font-face` for a brand family has a fallback face with all four descriptors. CLS from fonts should then sit inside the 0.1 gate already in `packages/qa/src/performance-gate.ts`.

## Loading and the byte budget

From the CSS2 guide read this pass: ask only for the weights you use, set `display` to something other than `auto`, and use `text=` when the headline is a known string.

Desk recipe:

1. Self-host subset woff2. Latin, plus Latin-ext only if the copy needs it. One variable file per family when the family has a `wght` axis. Two static files (regular and bold, or the one display weight) when it does not.
2. Preload the single headline file: `<link rel="preload" as="font" type="font/woff2" href="..." crossorigin>`.
3. `font-display: swap` on the preloaded headline, with the size-adjust fallback so the swap does not move layout. `font-display: optional` on the body if the body file is not preloaded, so a slow phone keeps the matched fallback instead of a late jump. Google's `display` parameter documents the same five values (`auto`, `block`, `swap`, `fallback`, `optional`).
4. `unicode-range` on each face so a page that is Latin does not download a full world set.
5. `document.fonts.ready` before any measurement or ScrollTrigger refresh. `recipe-check.ts` already looks for that.
6. Two families maximum. One family in two weights is one family.

Byte budget, as a gate the 241 spec can tune. It is a recommendation, not a measured median of these families (the files were not downloaded).

| Asset | Budget |
|---|---|
| Headline subset woff2, preloaded | ≤ 40 KB |
| Body subset woff2 | ≤ 45 KB |
| Both families, all shipped font files | ≤ 120 KB |
| A third file (italic, or a second axis) | Inside the 120 KB, or it does not ship |

A variable latin `wght` face often lands in that band after a real subset. If it does not, drop the unused axis, or ship two static weights, or use `text=` for the hero word. The page-weight gate in `weight-gate.ts` stays the backstop for the whole page. Fonts get their own counter so a 3D budget cannot eat the type budget and the other way around.

`font-synthesis: none` on the brand faces, so the browser does not invent a bold the file does not have. `text-wrap: balance` on headlines of three lines or fewer. `text-wrap: pretty` on body where the browser has it. Do not set `-webkit-font-smoothing: antialiased` on the root. It makes type thinner on Windows and the fallback metrics then lie.

## What 241a should change

`tokens.ts`: replace the six-pair list with the appendix, keyed by mood, and add `OVERUSED_DEFAULTS`. A named family from the person still wins (`pickType` already does this). An overused name that they did not type does not get dealt. `TYPE_LICENSE` becomes the per-family `ship` field, not one sentence.

`design-outputs.ts`: write the two family names and the world ratio into DESIGN.md. Keep a large display/body contrast. Derive it from the world.

`licenses.ts`: learn font records. OFL requires the license file beside the woff2. FFL requires the absence of the file and the presence of the Fontshare URL in CREDITS.json. Pangram without a paid-license flag is a blocker.

A Playwright type gate, at 375 and 1440: computed family is one of the brand families (`document.fonts.check`), at most two families, the ratios above, preload link present, woff2, `font-display` is `swap` or `optional`, fallback descriptors present, font bytes ≤ 120 KB.

## Machine-readable appendix

The array `pairs` has 48 shippable pairs. `do_not_ship` has the three Pangram references. `overused_defaults` is the family ban list. `banned_as_display_only` is Arial, Helvetica, and `system-ui`: they stay available as metric fallbacks and are refused as the display face. x/cap values are rounded to three decimals from the Fontshare API regular upright, or `null` when the binary was not measured. Pair 19 `axes` is empty because Instrument Serif returned with no variable axis. The body, Instrument Sans, accepted `wdth` and `wght` on the CSS2 request; attach those axes to the body family in 241, not to the display. Pair 31 `axes` is empty because Climate Crisis returned a single face and the year axis was not exercised.

```json
{
  "version": "2026-10-19",
  "license_pages_read": {
    "ofl": "https://www.fontshare.com/licenses/sil-ofl",
    "ofl_usage": "https://openfontlicense.org/how-to-use-ofl-fonts",
    "itf_ffl": "https://www.fontshare.com/licenses/itf-ffl",
    "collletttivo": "https://www.collletttivo.it/licensing",
    "pangram_faq": "https://pangrampangram.com/pages/faq",
    "velvetyne_pilowlava": "https://velvetyne.fr/fonts/pilowlava/"
  },
  "ship_rules": {
    "ofl-bundle": "Subset to woff2, ship the file and OFL.txt inside the generated site.",
    "ffl-owner-download": "Name the family and link Fontshare. Do not copy the font files into the handoff or this repo.",
    "trial-only": "Personal use only. Never a default."
  },
  "byte_budget": {
    "headline_woff2_max": 40960,
    "body_woff2_max": 46080,
    "all_font_files_max": 122880
  },
  "scale_by_world": {
    "editorial": { "ratio": 1.333, "min_display_over_body": 3.2 },
    "3d-world": { "ratio": 1.414, "min_display_over_body": 3.5 },
    "playful": { "ratio": 1.25, "min_display_over_body": 2.6 },
    "brutalist": { "ratio": 1.5, "min_display_over_body": 4.0 },
    "product": { "ratio": 1.2, "min_display_over_body": 2.2 },
    "fashion": { "ratio": 1.414, "min_display_over_body": 3.5 },
    "civic": { "ratio": 1.25, "min_display_over_body": 2.6 }
  },
  "banned_as_display_only": ["Arial", "Helvetica", "system-ui"],
  "overused_defaults": [
    "Inter",
    "Poppins",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Lato",
    "Nunito",
    "Raleway",
    "Playfair Display",
    "Bebas Neue",
    "Plus Jakarta Sans",
    "JetBrains Mono"
  ],
  "pairs": [
    {"id": 1, "display": "Boska", "body": "General Sans", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/boska", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.678, "x_cap_body": 0.734, "worlds": ["editorial", "fashion"], "deal": "default"},
    {"id": 2, "display": "Sentient", "body": "Switzer", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/sentient", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.733, "x_cap_body": 0.781, "worlds": ["editorial"], "deal": "default"},
    {"id": 3, "display": "Gambetta", "body": "Synonym", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/gambetta", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.665, "x_cap_body": 0.683, "worlds": ["editorial"], "deal": "default"},
    {"id": 4, "display": "Zodiak", "body": "Satoshi", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/zodiak", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.711, "x_cap_body": 0.676, "worlds": ["editorial", "fashion"], "deal": "default"},
    {"id": 5, "display": "Gambarino", "body": "Author", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/gambarino", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.743, "x_cap_body": 0.739, "worlds": ["editorial"], "deal": "default"},
    {"id": 6, "display": "Erode", "body": "Ranade", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/erode", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.742, "x_cap_body": 0.722, "worlds": ["editorial", "playful"], "deal": "default"},
    {"id": 7, "display": "Recia", "body": "Cabinet Grotesk", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/recia", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.697, "x_cap_body": 0.716, "worlds": ["editorial"], "deal": "default"},
    {"id": 8, "display": "Bespoke Serif", "body": "Bespoke Sans", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/bespoke-serif", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.723, "x_cap_body": 0.723, "worlds": ["editorial", "fashion"], "deal": "default"},
    {"id": 9, "display": "Neco", "body": "Amulya", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/neco", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.711, "x_cap_body": 0.675, "worlds": ["editorial", "playful"], "deal": "default"},
    {"id": 10, "display": "Rowan", "body": "Synonym", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/rowan", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.701, "x_cap_body": 0.683, "worlds": ["editorial"], "deal": "default"},
    {"id": 11, "display": "Fraunces", "body": "Instrument Sans", "foundry": "Undercase Type / Rodrigo Fuenzalida", "source": "https://fonts.google.com/specimen/Fraunces", "license": "OFL-1.1", "license_url": "https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": ["wght", "opsz", "SOFT", "WONK"], "x_cap_display": null, "x_cap_body": null, "worlds": ["editorial", "playful"], "deal": "default"},
    {"id": 12, "display": "Newsreader", "body": "Public Sans", "foundry": "Production Type / USWDS", "source": "https://fonts.google.com/specimen/Newsreader", "license": "OFL-1.1", "license_url": "https://www.fontshare.com/licenses/sil-ofl", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": ["opsz", "wght"], "x_cap_display": null, "x_cap_body": 0.715, "worlds": ["editorial", "civic"], "deal": "default"},
    {"id": 13, "display": "Literata", "body": "Familjen Grotesk", "foundry": "TypeTogether / Anton Koovit", "source": "https://www.fontshare.com/fonts/literata", "license": "OFL-1.1", "license_url": "https://www.fontshare.com/licenses/sil-ofl", "ship": "ofl-bundle", "woff2": "fontshare-css-api", "axes": ["opsz", "wght"], "x_cap_display": 0.714, "x_cap_body": 0.769, "worlds": ["editorial"], "deal": "default"},
    {"id": 14, "display": "Crimson Pro", "body": "Familjen Grotesk", "foundry": "Jacques Le Bailly / Anton Koovit", "source": "https://www.fontshare.com/fonts/crimson-pro", "license": "OFL-1.1", "license_url": "https://www.fontshare.com/licenses/sil-ofl", "ship": "ofl-bundle", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.733, "x_cap_body": 0.769, "worlds": ["editorial"], "deal": "default"},
    {"id": 15, "display": "Clash Display", "body": "Satoshi", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/clash-display", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.737, "x_cap_body": 0.676, "worlds": ["fashion", "editorial"], "deal": "default"},
    {"id": 16, "display": "Bodoni Moda", "body": "Instrument Sans", "foundry": "Owen Earl / Rodrigo Fuenzalida", "source": "https://fonts.google.com/specimen/Bodoni+Moda", "license": "OFL-1.1", "license_url": "https://github.com/google/fonts/blob/main/ofl/bodonimoda/OFL.txt", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": ["opsz", "wght"], "x_cap_display": null, "x_cap_body": null, "worlds": ["fashion"], "deal": "default"},
    {"id": 17, "display": "Melodrama", "body": "Supreme", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/melodrama", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.730, "x_cap_body": 0.697, "worlds": ["fashion", "playful"], "deal": "default"},
    {"id": 18, "display": "New Title", "body": "General Sans", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/new-title", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.761, "x_cap_body": 0.734, "worlds": ["fashion", "3d-world"], "deal": "default"},
    {"id": 19, "display": "Instrument Serif", "body": "Instrument Sans", "foundry": "Rodrigo Fuenzalida", "source": "https://fonts.google.com/specimen/Instrument+Serif", "license": "OFL-1.1", "license_url": "https://github.com/google/fonts/blob/main/ofl/instrumentserif/OFL.txt", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": [], "x_cap_display": null, "x_cap_body": null, "worlds": ["editorial", "product"], "deal": "default"},
    {"id": 20, "display": "Bevellier", "body": "Satoshi", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/bevellier", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.773, "x_cap_body": 0.676, "worlds": ["fashion"], "deal": "default"},
    {"id": 21, "display": "Stardom", "body": "Switzer", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/stardom", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 0.753, "x_cap_body": 0.781, "worlds": ["fashion", "3d-world"], "deal": "default"},
    {"id": 22, "display": "Switzer", "body": "Switzer", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/switzer", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.781, "x_cap_body": 0.781, "worlds": ["product"], "deal": "default"},
    {"id": 23, "display": "General Sans", "body": "General Sans", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/general-sans", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.734, "x_cap_body": 0.734, "worlds": ["product"], "deal": "default"},
    {"id": 24, "display": "Technor", "body": "Excon", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/technor", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.813, "x_cap_body": 0.719, "worlds": ["3d-world", "product"], "deal": "default"},
    {"id": 25, "display": "Nippo", "body": "Quilon", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/nippo", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.775, "x_cap_body": 0.789, "worlds": ["product", "3d-world"], "deal": "default"},
    {"id": 26, "display": "Space Grotesk", "body": "Archivo", "foundry": "Florian Karsten / Omnibus-Type", "source": "https://www.fontshare.com/fonts/space-grotesk", "license": "OFL-1.1", "license_url": "https://www.fontshare.com/licenses/sil-ofl", "ship": "ofl-bundle", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.699, "x_cap_body": 0.767, "worlds": ["product"], "deal": "on-request"},
    {"id": 27, "display": "Sora", "body": "Public Sans", "foundry": "Jonathan Barnbrook / USWDS", "source": "https://www.fontshare.com/fonts/sora", "license": "OFL-1.1", "license_url": "https://www.fontshare.com/licenses/sil-ofl", "ship": "ofl-bundle", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.732, "x_cap_body": 0.715, "worlds": ["product", "civic"], "deal": "default"},
    {"id": 28, "display": "Syne", "body": "Spline Sans", "foundry": "Bonjour Monde / ETC", "source": "https://fonts.google.com/specimen/Syne", "license": "OFL-1.1", "license_url": "https://www.fontshare.com/licenses/sil-ofl", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": ["wght"], "x_cap_display": null, "x_cap_body": 0.750, "worlds": ["playful", "product"], "deal": "default"},
    {"id": 29, "display": "Unbounded", "body": "Instrument Sans", "foundry": "Leonid Tishkov area / Rodrigo Fuenzalida", "source": "https://fonts.google.com/specimen/Unbounded", "license": "OFL-1.1", "license_url": "https://github.com/google/fonts/blob/main/ofl/unbounded/OFL.txt", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": ["wght"], "x_cap_display": null, "x_cap_body": null, "worlds": ["3d-world"], "deal": "default"},
    {"id": 30, "display": "Bricolage Grotesque", "body": "Newsreader", "foundry": "Mathieu Triay / Production Type", "source": "https://fonts.google.com/specimen/Bricolage+Grotesque", "license": "OFL-1.1", "license_url": "https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": ["opsz", "wdth", "wght"], "x_cap_display": null, "x_cap_body": null, "worlds": ["3d-world", "editorial"], "deal": "default"},
    {"id": 31, "display": "Climate Crisis", "body": "Familjen Grotesk", "foundry": "Eino Korkala, Daniel Coull / Anton Koovit", "source": "https://fonts.google.com/specimen/Climate+Crisis", "license": "OFL-1.1", "license_url": "https://github.com/google/fonts/blob/main/ofl/climatecrisis/OFL.txt", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": [], "x_cap_display": null, "x_cap_body": 0.769, "worlds": ["civic", "3d-world"], "deal": "default"},
    {"id": 32, "display": "Tanker", "body": "Cabinet Grotesk", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/tanker", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 1.0, "x_cap_body": 0.716, "worlds": ["brutalist", "3d-world"], "deal": "default"},
    {"id": 33, "display": "Panchang", "body": "Clash Grotesk", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/panchang", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.730, "x_cap_body": 0.737, "worlds": ["brutalist"], "deal": "default"},
    {"id": 34, "display": "Array", "body": "Tabular", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/array", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.800, "x_cap_body": 0.731, "worlds": ["brutalist", "product"], "deal": "default"},
    {"id": 35, "display": "Kihim", "body": "Gambetta", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/kihim", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 0.668, "x_cap_body": 0.665, "worlds": ["3d-world", "brutalist"], "deal": "default"},
    {"id": 36, "display": "Segment", "body": "General Sans", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/segment", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 1.0, "x_cap_body": 0.734, "worlds": ["brutalist", "3d-world"], "deal": "default"},
    {"id": 37, "display": "Pilowlava", "body": "Instrument Sans", "foundry": "Velvetyne / Rodrigo Fuenzalida", "source": "https://velvetyne.fr/fonts/pilowlava/", "license": "OFL-1.1", "license_url": "https://velvetyne.fr/fonts/pilowlava/", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": [], "x_cap_display": null, "x_cap_body": null, "worlds": ["3d-world"], "deal": "default"},
    {"id": 38, "display": "Aktura", "body": "Gambetta", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/aktura", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 0.614, "x_cap_body": 0.665, "worlds": ["editorial", "brutalist"], "deal": "default"},
    {"id": 39, "display": "Bonny", "body": "Pally", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/bonny", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.742, "x_cap_body": 0.746, "worlds": ["playful"], "deal": "default"},
    {"id": 40, "display": "Chillax", "body": "Synonym", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/chillax", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.726, "x_cap_body": 0.683, "worlds": ["playful", "product"], "deal": "default"},
    {"id": 41, "display": "Chubbo", "body": "Pally", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/chubbo", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.687, "x_cap_body": 0.746, "worlds": ["playful"], "deal": "default"},
    {"id": 42, "display": "Apfel Grotezk", "body": "Ortica", "foundry": "Collletttivo", "source": "https://www.collletttivo.it/typefaces/apfel-grotezk", "license": "OFL-1.1", "license_url": "https://www.collletttivo.it/licensing", "ship": "ofl-bundle", "woff2": "subset-from-upstream", "axes": [], "x_cap_display": null, "x_cap_body": null, "worlds": ["playful", "editorial"], "deal": "default"},
    {"id": 43, "display": "Comico", "body": "Author", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/comico", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 1.0, "x_cap_body": 0.739, "worlds": ["playful"], "deal": "default"},
    {"id": 44, "display": "Paquito", "body": "Pally", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/paquito", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.702, "x_cap_body": 0.746, "worlds": ["playful", "brutalist"], "deal": "default"},
    {"id": 45, "display": "Hoover", "body": "Ranade", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/hoover", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.663, "x_cap_body": 0.722, "worlds": ["brutalist", "editorial"], "deal": "default"},
    {"id": 46, "display": "Trench Slab", "body": "Excon", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/trench-slab", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.791, "x_cap_body": 0.719, "worlds": ["brutalist"], "deal": "default"},
    {"id": 47, "display": "Zina", "body": "Synonym", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/zina", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": [], "x_cap_display": 0.724, "x_cap_body": 0.683, "worlds": ["editorial", "playful"], "deal": "default"},
    {"id": 48, "display": "Sharpie", "body": "Alpino", "foundry": "Indian Type Foundry", "source": "https://www.fontshare.com/fonts/sharpie", "license": "ITF-FFL", "license_url": "https://www.fontshare.com/licenses/itf-ffl", "ship": "ffl-owner-download", "woff2": "fontshare-css-api", "axes": ["wght"], "x_cap_display": 0.709, "x_cap_body": 0.587, "worlds": ["editorial"], "deal": "default"}
  ],
  "do_not_ship": [
    {"id": "P1", "display": "Editorial New", "body": "client-licensed grotesque", "foundry": "Pangram Pangram", "source": "https://fontsinuse.com/foundry/2187/pangram-pangram", "license": "personal-trial", "license_url": "https://pangrampangram.com/pages/faq", "ship": "trial-only"},
    {"id": "P2", "display": "Cirka", "body": "Mori", "foundry": "Pangram Pangram", "source": "https://fontsinuse.com/foundry/2187/pangram-pangram", "license": "personal-trial", "license_url": "https://pangrampangram.com/pages/faq", "ship": "trial-only"},
    {"id": "P3", "display": "Agrandir", "body": "Telegraf", "foundry": "Pangram Pangram", "source": "https://fontsinuse.com/foundry/2187/pangram-pangram", "license": "personal-trial", "license_url": "https://pangrampangram.com/pages/faq", "ship": "trial-only"}
  ]
}
```

Pair 49 and 50 from the prose (Red Hat Display / Public Sans, Boxing / Switzer) are real and licensed the same way. They were left out of the JSON so the appendix stays a single checked array of 48. The 241 spec can add them as ids 49 and 50 without new research: Red Hat Display is Fontshare `sil_ofl` (x/cap 0.716) at https://www.fontshare.com/fonts/red-hat-display, and Boxing is ITF FFL (x/cap 0.695) at https://www.fontshare.com/fonts/boxing.

## Shortlist not promoted

These were seen and not given a pair, because the per-family license line or the metrics were not opened.

- Velvetyne, beyond Pilowlava: Gulax, Avara, Terminal Grotesque. Foundry rights screen says commercial use. Open each font page's License line first. Terminal Grotesque is also on the Open Foundry homepage.
- Collletttivo index, beyond Apfel and Ortica: Mazius Display, Sprat, Halibut, Coconat, Mattone, Messapia, Necto Mono, and the rest of https://www.collletttivo.it/typefaces. The foundry license covers them. Confirm each `LICENSE.txt` at install.
- Open Foundry homepage also lists Cooper Hewitt, League Gothic, EB Garamond, Bagnard, Young Serif, and Junicode. Useful, and each needs its own license file read. Cooper Hewitt's museum page was not opened this pass.
- Climate Crisis custom axes: unverified beyond a single returned face.
- Google `OFL.txt` files were linked, not each opened, except the OFL text itself on the Fontshare and openfontlicense.org pages, and the Fraunces description.
