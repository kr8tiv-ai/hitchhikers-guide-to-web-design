# Goal

Add one section with real copy and layout. Motion comes later.

Build one section. Fill the real copy slots with lines from the brand. Ban lorem ipsum and any other placeholder paragraph.

# Files

- src/components/[SectionName].astro
- [page], placed after [previous section]

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: [Section name] section

Build src/components/[SectionName].astro and add it to [page] after [previous section]. Purpose: [one job of this section]. Content: headline "[headline]", copy "[copy]", [cards / image grid / testimonial / FAQ list]. Layout: [describe it, or "steal the structure of [reference site]'s [section], not the look"]. Use only brand fonts and colors. Mobile first, then desktop. No effects yet; motion comes in a later prompt.

The headline slot and the copy slot are real copy. If a fact, a name, or a number is missing, mark it TODO. Do not invent it.

Never say: delve, unlock, elevate, seamless, game-changer, empower, journey. No em dashes, no exclamation points.

Never write "as before" or "see above".

# must_haves

truths:

- The section has one job, a real headline, and real copy.
- The layout uses only brand fonts and colors, mobile first, then desktop.
- No effects are added. Motion comes in a later prompt.

artifacts:

- src/components/[SectionName].astro
- [page] includes that component after [previous section]

key_links:

- [SectionName].astro is added to [page] and to no other route in this prompt.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not write lorem ipsum or placeholder copy.
- Do not add motion, a scroll library, or effects.
- Do not invent testimonials, fake logos, or made-up numbers.
- Do not paste site-rules.ts into this prompt.

# Verify

Load [page]. Read the headline and the copy. Confirm both are real, the section follows [previous section], and nothing animates.

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
