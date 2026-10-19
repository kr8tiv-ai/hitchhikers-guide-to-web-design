---
name: three
version: 0.186.1
license: MIT
docs: https://threejs.org/docs/
llms: https://threejs.org/docs/llms.txt
checked: 2026-10-19
npm: three
description: Vocabulary for a single WebGL scene in the generated site. One renderer, a poster, and a loop the page can stop.
when-to-use: Use when the art direction asks for a WebGL hero or a shader on a three.js canvas.
paths:
  - packages/knowledge/packs/three/SKILL.md
---

# Three.js

One renderer, a capped pixel ratio, and a poster behind the canvas. Pause the loop when the section is off screen, and dispose geometry when the page changes. A reduced-motion visit shows the poster and does not start the animation loop. There is no built-in reduced-motion switch, so the page gates the loop itself.

Prefer WebGLRenderer when the page must run widely. WebGPURenderer and node materials are available when the brief wants them. Import the module. A single animation clock, shared with the page ticker, is enough.

Keep the scene small. One object that explains the offer beats a gallery of effects. Grain stays low. Text stays in HTML, not in the texture.

Source: https://threejs.org/docs/
