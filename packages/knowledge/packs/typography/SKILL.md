---
name: typography
description: At most two families, fluid type with clamp, and a recorded license. The six pairings are examples.
when-to-use: Use when a site prompt sets type, chooses a font, or writes a size scale.
paths:
  - packages/knowledge/packs/typography/SKILL.md
---

# Typography

Read the type section of `BRAND.md` before you choose a face. If that section names a pair, use it. This pack does not fetch font files.

## Two families

Use at most two families. One family in two weights counts as one family and stays inside that cap. A third family is a miss. One face is for headlines. The other is for text.

The six pairings below are examples, not mandates.

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

Record the license beside the family in `CREDITS.json`. Google Fonts and Fontshare are the allowed sources. Confirm the license at install. Fontshare is not one license for the whole catalog. Read the family's `license_type`. Do not write an API key into the site or the repo.
Source: context/research/07-3d-assets-open-source.md. The Google Fonts developer API requires a key from the environment: https://developers.google.com/fonts/docs/developer_api. Fontshare's public list needs no key: GET https://api.fontshare.com/v2/fonts
Source: packages/engine/src/brand/tokens.ts

Method from Matt Haynes's AntiHero guides (antihero.community), used with permission. Sentences in this pack are original.
