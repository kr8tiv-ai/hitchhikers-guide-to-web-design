---
name: example
description: Checks a knowledge pack for required frontmatter and a source after every statistic.
when-to-use: Use when writing or reviewing a knowledge pack before the Guide loads it.
paths:
  - packages/knowledge/src/pack.ts
  - packages/knowledge/packs/**
---

This pack describes the checker in the knowledge package. A pack is a folder whose SKILL.md opens and closes its frontmatter with fences. The required keys are description, when-to-use, and paths. paths is a list of strings. A single string in that field is refused.

Set effort on the prompt. This file does not carry an effort field.

The claim linter reads the body. A line that states a percent, or a four-digit year used as a statistic, must be followed by a non-empty line that starts with Source. This note is about the checker, so it makes no external claim.
