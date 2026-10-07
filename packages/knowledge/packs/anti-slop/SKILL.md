---
name: anti-slop
description: Shared ban list for generated sites. Layout tropes, hype words, and the Elevate name exception.
when-to-use: Use when writing site copy, generating a page, or linting a site for slop. The writer and the linter read this same list.
paths:
  - packages/knowledge/packs/anti-slop/SKILL.md
---

# Anti-slop

This file is the ban list. A later linter should read the fenced lines as data and match the word and phrase fences to `BANNED_WORDS` and `BANNED_PHRASES` in `packages/engine/src/brand/voice.ts`. A hit is a fix taken from `BRAND.md`, `VOICE.md`, and the motion spec. Do not swap one trope for another.

## Never

The pattern fence is the layout ban. It includes purple-to-blue gradients, three identical icon cards, lorem, invented testimonials, and the default Tailwind indigo look (gray-50, rounded-xl, indigo buttons, everything centered).

Magnetic buttons are banned. Do not attract a control toward the pointer, and do not ship magnetic buttons. A custom cursor is allowed only when it is the brand idea, and never on touch. That exception does not cover magnetic buttons.

## Words and punctuation

Match the word fence as whole words in generated site copy. The phrase fence holds the voice compiler strings. A longer line that starts the same way, including a contrast after "it's not just", is the same ban. `VOICE.md` may add words. It may override punctuation. It may not put elevate back into generated site copy.

Generated site copy uses no em dashes and no exclamation marks, unless `VOICE.md` overrides punctuation.

## Elevate

The word elevate is banned in generated site body copy, including the hero, headings, buttons, and captions. Elevate may appear as the product name in the Guide's own docs, as the command `/hh-elevate`, and in headings of the Guide app chrome. That is a name and a command. It is not permission to use the word in a hero.

## Reach

One signature moment. A type scale with real contrast. Asymmetric space. One idea in a section. Facts only this brand has, taken from `BRAND.md`. If a detail is not real yet, mark it TODO and track it. Do not invent the proof.

## Nutrimatic

Static checks read the fences: words, phrases, em dashes, exclamation marks, lorem, an untracked TODO, default Tailwind palette classes, purple-to-blue gradients, magnetic pointer math, and emoji in headings. Visual checks look for a centered blob hero, three identical icon cards, cloned section rhythm, weak contrast, and a layout that looks like a thousand other sites. Name the reason, then name the fix.

## Ban list

```patterns
purple-to-blue gradient
rainbow gradient
centered hero with a floating blob
three identical icon cards
emoji as icons
lorem
stock people pointing at laptops
default Tailwind indigo look
repeated section rhythm
invented testimonials
invented logos
invented numbers
magnetic buttons
cursor trails
glass everywhere
gradient headlines
aurora blobs
particle fields without a narrative
bento as the default layout
fake trusted-by strip
Learn More
Get Started
Build the future of X
sparkles
rockets
scramble on every heading
scroll-jacking
autoplay sound
preloader over 2 seconds without a real load
grey body text
stock glossy toruses
max-w-7xl mx-auto text-center
em dash
exclamation mark
```

```words
unlock
elevate
seamless
revolutionize
empower
game-changer
delve
leverage
synergy
robust
cutting-edge
journey
tapestry
landscape
innovative
passionate
```

```phrases
in today's fast-paced world
it's not just
in a world where
```

Method from Matt Haynes's AntiHero guides (antihero.community), used with permission. Sentences in this pack are original.
