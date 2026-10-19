---
name: "@react-three/fiber"
version: 9.8.2
license: MIT
docs: https://r3f.docs.pmnd.rs/
llms: https://r3f.docs.pmnd.rs/llms.txt
checked: 2026-10-19
npm: "@react-three/fiber"
description: A small React Three Fiber island on an Astro page. The rest of the page stays HTML.
when-to-use: Use when the art direction wants a React canvas island and the stack already allows one.
paths:
  - packages/knowledge/packs/r3f/SKILL.md
---

# React Three Fiber

One Canvas, a capped device pixel ratio, and a poster for the first paint. Use frameloop demand unless the scene is continuous. useFrame is the clock. useLoader caches by URL. Dispose on unmount. On Astro, hydrate with client visible so the island waits until it is near the viewport.

Fiber 9 pairs with React 19. The peer range is React 19 below 19.4 and three from 0.156 upward. Skip the canvas on the server. No reduced-motion hook ships with the library, so skip useFrame motion when the visitor asks for less motion and show the poster.

The island is the exception. Ordinary copy stays in HTML beside it.

Source: https://r3f.docs.pmnd.rs/
