---
name: "@react-three/drei"
version: 10.7.9
license: MIT
docs: https://pmndrs.github.io/drei
llms: none
checked: 2026-10-19
npm: "@react-three/drei"
description: Named helpers for a React Three Fiber scene. Helpers are optional vocabulary, not a required kit.
when-to-use: Use when a fiber island needs a helper such as Environment, ContactShadows, Float, Text, or shaderMaterial.
paths:
  - packages/knowledge/packs/drei/SKILL.md
---

# drei

drei sits beside React Three Fiber and uses three-stdlib rather than the examples path inside three. Name a helper when it serves the scene. Environment, ContactShadows, Float, Text, shaderMaterial, AdaptiveDpr, and PerformanceMonitor are the usual words. Physics and device-orientation controls stay out unless the brief asks for them.

A helper is a starting point. Compose a scene that belongs to this brand. AdaptiveDpr and PerformanceMonitor are how a heavy frame steps down instead of stalling the page. Text in the canvas is for a short mark. Longer sentences stay in HTML.

Source: https://pmndrs.github.io/drei
