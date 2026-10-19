---
name: glsl
version: built-in
license: none-stated
docs: https://www.khronos.org/opengl/wiki/OpenGL_Shading_Language
llms: none
checked: 2026-10-19
npm: glsl
description: A small shader for gradient noise or image distortion, with a still fallback.
when-to-use: Use when the art direction wants a shader and the page already has one WebGL context.
paths:
  - packages/knowledge/packs/glsl/SKILL.md
---

# GLSL

A fullscreen quad, uniforms for time and pointer, and grain at a low amplitude. Distort an image on hover, not on the whole page at once. Pause the clock when the tab is hidden. The still underneath is the fallback when the shader does not run, including reduced motion.

The shader lives on the page's one WebGL context. It can be three, a fiber shaderMaterial, or a small OGL program. The look comes from this brand's grade, not from a copied demo.

Source: https://www.khronos.org/opengl/wiki/OpenGL_Shading_Language
