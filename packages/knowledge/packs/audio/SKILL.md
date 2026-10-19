---
name: howler
version: 2.2.4
license: MIT
docs: https://howlerjs.com
llms: none
checked: 2026-10-19
npm: howler
description: Opt-in ambient sound. Off until a labelled control is pressed. No autoplay.
when-to-use: Use when the brief asks for ambient sound and a credited file exists.
paths:
  - packages/knowledge/packs/audio/SKILL.md
---

# Audio

Sound stays off until a visible control is pressed. Create or resume the audio context inside that click. Remember the choice and say so on the control. Reduced motion does not start a decorative loop unless the visitor turns sound on.

Howler defaults to Web Audio and can fall back to HTML5 audio. For a long file, html5 true avoids waiting on a full decode. autoSuspend sleeps the context after a quiet stretch. On a play error, wait for unlock, then try again. If no generated or licensed file exists, the page has no sound.

Source: https://howlerjs.com
