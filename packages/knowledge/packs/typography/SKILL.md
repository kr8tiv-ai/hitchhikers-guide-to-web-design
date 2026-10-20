---
name: typography
description: At most two families, fluid type with clamp, and a pair from the library. The six pairings are examples.
when-to-use: Use when a site prompt sets type, chooses a font, or writes a size scale.
paths:
  - packages/knowledge/packs/typography/SKILL.md
---

# Typography

Read the type section of `BRAND.md` before you choose a face. If that section names a pair, use it. This pack does not fetch font files.

## Two families

Use at most two families. One family in two weights counts as one family and stays inside that cap. A third family is a miss. One face is for headlines. The other is for text.

The six pairings below are examples, not mandates. They are not the automatic deal. The desk deals from the pairing library unless the person names a family, including one of these.

- Bebas Neue with Barlow
- Space Grotesk with Inter
- DM Serif Display with DM Sans
- Fraunces with Work Sans
- Archivo Black with Archivo
- Clash Display with Satoshi

Inter in that list is an example body face. It is not the default for a brand that did not choose it.

## Size

Body text is at least 16 CSS pixels. Line height sits between 1.4 and 1.6. A line of body text runs about 45 to 75 characters.
Source: context/research/07-3d-assets-open-source.md

Fluid type uses `clamp()`, with a floor, a preferred value, and a ceiling. Read the sizes from `BRAND.md` when they exist. Do not invent a scale and present it as the brand's.

Check the type at the phone widths 375, 390, and 430.
Source: hh-build-plan/CONTEXT-PACKAGE.v2.md section 15.5.

## Loading

The generated site self-hosts the woff2 for the faces it ships. Use `font-display: swap` or `font-display: optional`. Preload the one file that paints the headline. Subset to the scripts the page uses. Do not download font files into the Guide repo.
Source: context/research/07-3d-assets-open-source.md
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

The desk does not verify a font license. A library pair may name a license and a source as notes. Those notes do not pass or fail a site. Do not write an API key into the site or the repo.
Source: packages/engine/src/brand/tokens.ts

Method from Matt Haynes's AntiHero guides (antihero.community), used with permission. Sentences in this pack are original.
