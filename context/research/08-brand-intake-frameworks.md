# 08 · Brand intake frameworks for the interview (with Matt's brand guide)

Research date: 2026-10-05. Primary source: **Matt Haynes, *Build a Brand From Scratch With AI*** (AntiHero AI live guide, Oct 1, 2026, 36 pages). The attachment is byte-identical to the public PDF at [antihero.community/guides/build-a-brand-from-scratch-with-ai.pdf](https://antihero.community/guides/build-a-brand-from-scratch-with-ai.pdf); a copy is in `/workspace/context-engine/sources/`. Other framework sources are linked inline.

## 1. Frameworks to encode (and how each becomes an interview module)

| Framework | Source | What it captures | Interview output field |
|---|---|---|---|
| **Golden Circle** (Why → How → What) | Simon Sinek, TEDxPuget Sound 2009 ([TED](https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action)) | Purpose. "People don't buy what you do, they buy why you do it." Profit is a result, not a why | `why` ("To [contribution] so that [impact]"), `how` (3–5 principles), `what` (plain English) |
| **Brand = gut feeling** | Marty Neumeier, *The Brand Gap* (via Matt's guide) | A brand is "a person's gut feeling about a product, service or organization" | Framing for the whole interview |
| **12 archetypes** | Jung via Mark & Pearson, *The Hero and the Outlaw* (2001), per Matt's guide | Personality shortcut: Innocent, Everyman, Hero, Outlaw, Explorer, Creator, Ruler, Magician, Lover, Caregiver, Jester, Sage. Matt: "Pick one main archetype and maybe a second. If you pick five, you picked none" | `archetype.primary`, `archetype.secondary`, competitor archetypes |
| **StoryBrand SB7** | Donald Miller ([storybrand.com](https://storybrand.com/), [workbook PDF](https://storybrand.com/downloads/StoryBrand-Online-Marketing-Course-Workbook.pdf)) | Character (customer) has a Problem (external/internal/philosophical), meets a Guide (brand: empathy plus authority), who gives a Plan, Calls them to Action, helping them avoid Failure and reach Success | Homepage narrative skeleton; Matt's "customer is the hero, you're Yoda, not Luke" |
| **Positioning statement** | Template in Matt's guide | "For [target] who [need], [brand] is the [category] that [benefit] because [proof]. Unlike [alternative], we [difference]." | `positioning` (3 versions: honest / bold) |
| **Tone of voice dimensions** | NN/g, [The Four Dimensions of Tone of Voice](https://www.nngroup.com/articles/tone-of-voice-dimensions/) | Funny vs serious, formal vs casual, respectful vs irreverent, enthusiastic vs matter-of-fact | Four voice sliders, plus Matt's "3 traits, this-not-that" (Direct not Rude, Funny not Clowning, Human not Sloppy) |
| **Color psychology (with caveats)** | Matt's guide | Signals per hue, with an honest caveat: "the research is mixed"; meaning shifts with culture, shade and category. **Standing out from competitors matters more** | Palette with a job for each color; **60-30-10**; WCAG AA contrast **4.5:1 body / 3:1 large text** ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)) |
| **Type pairing** | Matt's guide | Two fonts max (one loud display, one calm body), or one family in two weights. Pairings: Bebas Neue + Barlow, Space Grotesk + Inter, DM Serif Display + DM Sans, Fraunces + Work Sans, Archivo Black + Archivo, Clash Display + Satoshi | `type.display`, `type.body`, sizes and line heights |
| **Mood board / "steal like an artist"** | Austin Kleon via Matt | Collect 30–60 items over a week; steal structure and principles from many sources, never surface details from one | Image drop zone → Mood Folder Analyzer (Prompt 04) |
| **Competitor teardown / "sea of sameness"** | Matt's Prompt 03 | Positioning, audience, visual identity (hex guesses), voice, weaknesses, complaints → white space | `competitors[]`, `avoid[]`, `whitespace[]` |
| **KPIs and conversion goals** | Matt's site interview Q1 ("the one action a visitor should take"), plus my synthesis | Primary CTA, secondary CTA, success metric (leads/week, bookings, signups, sales) | `goal.primaryAction`, `goal.metric`, analytics events |
| **Sales funnel vs brand site** | My synthesis | *Funnel/landing page*: one offer, one CTA, proof stack, objection handling, short. *Brand/experience site*: story, world-building, signature moment, multiple paths. Many sites need a hybrid: an immersive hero plus a conversion spine | `siteType: funnel \| brand \| hybrid`, which changes the section plan template and the motion ceiling |

### How agencies run discovery (pattern behind Matt's Prompt 02)
Matt: "A real brand agency starts every job with a discovery session. It costs thousands because it takes hours and somebody has to ask the awkward questions." His Prompt 02 runs **five rounds, one question at a time**:
1. **Business**: what you sell, problem solved, before and after, why pick you over doing nothing
2. **People**: best and worst customer ever, where they hang out, what they're tired of hearing
3. **Competition**: alternatives, what they get right, what's boring
4. **Personality**: "if my brand walked into a bar", 3 words to be called, 3 never, brands loved from any industry
5. **Practical**: budget, deadlines, first touchpoints, things to keep

The rules are worth keeping: follow up on vague answers, point out contradictions, don't move rounds until this one is understood. The output is a *Brand Discovery Brief* with these headings: Business in One Paragraph, The Why (draft), Ideal Customer, Competitors and the Sea of Sameness, Personality (3 traits + 3 anti-traits), Visual Direction Notes, Must-Haves and Never-Evers, Open Questions, plus the "3 biggest risks to this brand, stated bluntly."

## 2. Matt's guide: structure

12 sections, in a deliberate order ("Don't skip the why. Everyone wants to skip the why. That's why everyone's brand looks the same."):

1. **Start with why**: Golden Circle, why people buy *you*, five talks (Sinek; Godin ×2; Andrew Stanton; Austin Kleon)
2. **Steal like an artist**: gather context first ("An AI with no context gives you the average of the internet… a blue logo with a swoosh")
3. **Mood folder**: what to collect and where (font, color, brand and site galleries such as Fonts In Use, Coolors, Brand New, Godly, Awwwards, Pinterest), plus brands to study (Apple, Nike, Patagonia, Liquid Death, Duolingo and others)
4. **Story, archetype, positioning**
5. **Color**: psychology with caveats, 60-30-10, contrast. AntiHero palette example: Anti Black #0A0A0B (60%), Bone #ECE8E1, Graphite #2B3035, Ash #8A9096, Hero White #FFFFFF, Ignition Red #E0261E (10%; "4.7:1 on white, so it passes for body text, barely")
6. **Typography**: 2 fonts, free sources, pairings
7. **Logo**: 7 types (wordmark, lettermark, symbol, abstract, combination, emblem, mascot); tests (simple, memorable, scalable to 32px, one color, squint, mockup); files (master SVG, one-color black and white, square profile, favicon 32/16, app icon 512, transparent PNG 4096/1024/512, print PDF). Honest AI note: "Image models are great at concepts and still bad at letters"
8. **Backgrounds and templates**: imagery rules (what you show and never show, light, grade, calm space for text, real people), 5 social templates
9. **Brand voice**: 3 traits, a **banned-words "AI slop list"** (delve, unlock, elevate, seamless, game-changer, leverage, synergy, robust, cutting-edge, journey, tapestry, landscape, empower, revolutionize, "in today's fast-paced world", "it's not just X, it's Y", "In a world where"), before and after rewrites, tagline
10. **The brand brain**: one doc the AI reads first, every time. A short version under 1,500 words plus a full version
11. **Checklist and mistakes** (11 checks; mistakes like starting with the logo, copying the category leader, letting AI pick for you, never asking real people)
12. **Run of show, cheat sheet, links** (a 40-minute live demo plan using Grok Bot)

## 3. The 18 prompts (summary)

| # | Prompt | Role / mechanics | Output |
|---|---|---|---|
| 01 | **Why Finder** | Brand strategist who "has read Start With Why twice"; ≥12 questions one at a time; pushes back on vague answers; digs for the origin story | WHY ("To… so that…"), HOW (3–5), WHAT, 3 belief lines safe→bold, a 120-word proof story in the user's words |
| 02 | **Brand Discovery Interview** | Senior strategist, paid session, 5 rounds (above) | Brand Discovery Brief + 3 biggest risks |
| 03 | **Competitor Teardown** | "Ruthless but fair" analyst; browses sites, socials, reviews (or screenshots) | Per-competitor profile, comparison table, Sea of Sameness, 3 white-space opportunities, what to steal |
| 04 | **Mood Folder Analyzer** | Design director "who doesn't flatter"; analyzes uploaded images | Common threads, 3-word aesthetic, 5–7 hex palette (with source image), type classification + free equivalents, photo style, outliers, **3 directions** |
| 05 | **Reverse-Engineer a Brand You Love** | Case study at small-budget scale | Golden Circle, archetype, 3–5 key decisions, voice rules, their no's, 5 ideas under budget |
| 06 | **Archetype, Positioning, Ideal Customer** | Primary/secondary archetype and how each changes headline, colors, photos | 3 positioning statements (honest/bold marked), one specific persona, 3 non-customers |
| 07 | **Brand Story Writer** | Customer = hero; banned words; real details | 25 / 100 / 300-word stories + a "barbecue" one-liner |
| 08 | **Palette Generator with Psychology** | Color strategist; avoids competitor colors | 3 palettes with 60-30-10, reasoning with caveats, contrast ratios flagged, real-life previews, recommendation |
| 09 | **Font Pairing** | Free fonts only (Google/Fontshare) with links | 5 pairings, weights, web sizes, failure modes, sample copy; one single-family option; license flags |
| 10 | **10-Logo Concept Sheet** | Logo designer, 20 years; 2 wordmarks, 2 lettermarks, 2 symbols, 2 combos, 1 emblem, 1 wildcard | Draw-ready descriptions, top 4 rendered as flat vector-style images, ranked |
| 11 | **Logo Refinement and Exports** | Design-director critique; small-size tests; usage rules | Refinements, clean SVG trace, the full export set with naming `[brand]-logo-[version][size].png` |
| 12 | **Imagery Style Guide and Backgrounds** | Subjects, light, grade, composition, people, textures | Guide + 6 image prompts (3 at 16:9, 3 at 1:1) ending "no text, no letters, no logos, no watermarks, no faces" |
| 13 | **Social Template System** | 5 templates × feed/square + story | Layout with px margins, type, color rules, copy limits, example posts; HTML, Canva or Figma spec |
| 14 | **Brand Voice Guide Writer** | Learns from 3–5 real samples + 1 anti-sample | 3 traits this-not-that, 8-row do/don't, vocabulary + banned list, punctuation, tone by situation, 5 rewrites |
| 15 | **Tagline Generator** | 30 taglines in 6 styles, ≤6 words | Top 5 tested (true? stealable? out loud? 10 years? screenshot-worthy?) + favorite |
| 16 | **Daily Use: Say It in My Voice** | Reads the brand brain; cut by a third | Safe and edgy versions + "least sure" line |
| 17 | **Brand Brain Compiler** | 12-section doc, ending in instructions *to the AI* | Markdown under ~1,500 words + designed HTML/PDF |
| 18 | **Act as My Brand Director** | "Allergic to flattery" | 3-second impression, 6 on-brand scores (1–10), biggest problem, 3 fixes by impact, rewrite, what to keep |

**Recommended order (from the guide):** 01 or 02 → 03, 04, 06, 07 → 08, 09, 10, 11, 12, 13 → 14, 15 → 17. Use 16 and 18 forever after.

## 4. How this maps to the app's interview

**Module A, Brand (skip if a brand brain is uploaded).** Run Prompts 01/02 → 03 → 04 → 06 → 07 → 08 → 09 → 14 → 15 → 17, conversationally, by voice or text, with image drops for the mood folder (Prompt 04) and competitor URLs auto-screenshotted (Prompt 03). Logo (10/11) and imagery (12) become **asset jobs**: Grok Imagine renders concepts; the final wordmark is set in the real font and the SVG is traced or hand-built by Grok (Matt's warning about letters). **The output is `BRAND.md`** (Matt's brand brain format), which becomes the constitution for everything downstream.

**Skippable design.** Every module offers three choices: *answer*, *let AI propose from what you've given me* (GSD assumptions mode), or *skip, use defaults*. Defaults are flagged `TODO` in the RULES paragraph ("Missing just one piece? Make a stand-in, mark it TODO… Just don't ship it like that." from *Websites on Autopilot*). The interview engine tracks coverage per field so the PRD generator knows what's assumed.

**Gates borrowed from the guide's checklist** (must pass before the build starts): the why fits in one sentence and isn't about money; the customer is a specific person; competitor colors and words are known and avoided; 1–2 archetypes; palette with hex codes and jobs, 60-30-10, and contrast passing; ≤2 fonts with sizes; logo works at 32px and in one color; voice guide with banned words and examples; brand brain exists.

**Prompt 18 is the reviewer's brand lens.** Every review cycle scores message, voice, color, typography, imagery and layout 1–10 against `BRAND.md`.
