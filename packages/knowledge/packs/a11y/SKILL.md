---
name: a11y
description: Keyboard, focus, names, contrast, target size, and reduced motion for generated sites.
when-to-use: Use when a site prompt builds a control, a menu, a dialog, a form, or a review checks access.
paths:
  - packages/knowledge/packs/a11y/SKILL.md
---

# Accessibility

A serious or critical axe finding does not ship. Where the Guide floor is stricter than the checker, the Guide floor wins.
Source: WCAG 2.2. hh-build-plan/CONTEXT-PACKAGE.v2.md section 12. hh-build-plan/RESEARCH-ADDENDUM.md section 9.

## Contrast

Body text is at least 4.5 to 1. Large text is at least 3 to 1. `proposePalettes` keeps ink on paper only at 4.5 or above, and it drops a weaker ink.
Source: WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
Source: https://www.w3.org/TR/WCAG22/
Source: packages/engine/src/brand/tokens.ts

A control boundary or a meaningful icon is at least 3 to 1 against the adjacent color.
Source: WCAG 2.2. https://www.w3.org/TR/WCAG22/

Do not ship gray body text on a light ground and call it minimal. Do not use color as the only signal. An error needs words.

## Target size

Every touch target is at least 44 CSS pixels on the shorter side.
Source: hh-build-plan/CONTEXT-PACKAGE.v2.md section 15.5. WCAG 2.2 Success Criterion 2.5.5 names this enhanced size. https://www.w3.org/TR/WCAG22/

The axe rule `target-size` is not that floor. Its minimum is 24 CSS pixels, so a pass there still fails this pack when a target is under 44.
Source: https://github.com/dequelabs/axe-core/blob/develop/doc/check-options.md

## Keyboard and focus

Every action works from the keyboard. An open menu keeps focus inside itself until it closes. Escape closes it. Focus stays visible. Do not remove the outline unless the replacement is still visible against the surface. A dialog keeps focus until it closes, closes on Escape, and returns focus to the control that opened it.

## Names

Every control has a name. An icon button has a name. A field has a label, and placeholder text is not that label. An image that carries meaning has a text alternative. A decorative image has an empty alternative.

Axe rules for those names are `button-name`, `input-button-name`, `aria-command-name`, `label`, `select-name`, and `input-image-alt`. Contrast is `color-contrast`.
Source: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md

## Motion

When `prefers-reduced-motion` matches, turn off Lenis, scroll scrub, and autoplay. Leave the content visible.
Source: hh-build-plan/CONTEXT-PACKAGE.v2.md section 15.2.
Source: hh-build-plan/RESEARCH-ADDENDUM.md section 9.

## Forms

Set `inputmode` and `autocomplete` on fields, and keep the visible label. The UX pack states the same rule. Use a real autocomplete token.

Sentences in this pack are original.
