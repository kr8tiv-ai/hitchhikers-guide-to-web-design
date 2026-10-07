---
name: color
description: Apply a 60-30-10 palette, check contrast, and treat hue meaning as not universal.
when-to-use: Use when a site prompt sets a palette, a CSS custom property, or a light and dark ground.
paths:
  - packages/knowledge/packs/color/SKILL.md
---

# Color

Read the color section of `BRAND.md`. When that section is empty, draft up to three palettes and stop for a choice. Do not invent a fourth.

## Shares

Use 60-30-10 as a design rule, not a law of perception. The roles, in that order, are paper, ink, and signal. Paper is the ground, ink is the text, and signal marks the one action that must be found.
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.
Source: packages/engine/src/brand/tokens.ts

## Contrast

Body text is at least 4.5 to 1. Large text is at least 3 to 1. `proposePalettes` keeps ink on paper only at 4.5 or above, and it drops a weaker ink. A seed that fails as body text stays the signal, not the ink.
Source: WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
Source: https://www.w3.org/TR/WCAG22/
Source: packages/engine/src/brand/tokens.ts

A control boundary or a meaningful icon is at least 3 to 1 against the adjacent color.
Source: WCAG 2.2. https://www.w3.org/TR/WCAG22/

Do not ship gray body text on a light ground and call it minimal. Check the same bars again when the brand has a dark paper. Write the palette as CSS custom properties. Tailwind is opt-in, and the default indigo look is banned.

## Not the only signal

Do not use color as the only signal. An error, a selected state, and a chart series also need text, an icon, or a pattern.

## Meaning

Color meaning is not universal: the research is mixed, one hue does not carry one emotion in every culture, red does not always mean danger, and standing apart from competitor colors matters more than a hue chart.
Source: context/research/08-brand-intake-frameworks.md
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

Do not publish a chart that assigns one feeling to a hue.

Method from Matt Haynes's AntiHero guides (antihero.community), used with permission. Sentences in this pack are original.
