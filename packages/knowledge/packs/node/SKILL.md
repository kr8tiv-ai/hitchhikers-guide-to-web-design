---
name: node
version: built-in
license: MIT
docs: https://nodejs.org/docs/latest/api/
llms: none
checked: 2026-10-19
npm: node
description: When a generated site needs a server, and when a static brochure does not.
when-to-use: Use when the brief asks for a server, a form handler, or a runtime check. A static site can ignore it.
paths:
  - packages/knowledge/packs/node/SKILL.md
---

# Node.js

Astro 7 expects a current Node 22 line. A brochure can stay static. Add a server when the brief needs a form, a session, or a private request. An API route is for that job, not for decoration.

Keep secrets in the environment of the host, not in the page. The desk build itself does not call this runtime to generate media.

Source: https://nodejs.org/docs/latest/api/
