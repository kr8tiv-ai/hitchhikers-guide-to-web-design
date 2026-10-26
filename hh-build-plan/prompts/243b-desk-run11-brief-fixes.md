---
id: "243b"
kind: build
phase: improbability-drive
slice: Forty-Two
tier: Heart of Gold
effort: xhigh
model: grok-4.7-build-fast
always_approve: true
review_checkpoint_embedded: false
depends_on: ["243a"]
title: "Desk Run 11 brief fixes: Change something overwrites fields, unanswerable recap question, duplicate follow-up, wrong suggested host"
---

# 243b. Desk Run 11 brief fixes

## Why
Desk Tester Run 11 (branch desk-run11-fixes at 2b30b446, project "Paradise Found Run Eleven C" in C:\Users\lucid\Desktop\desk-e2e-run11\site-c) finished the interview (61 of 61) and reached the Site Brief on 2026-10-26. Four bugs block a clean brief approval. Evidence: C:\Users\lucid\Desktop\desk-e2e-run11\ (BUGS.md, QA-LOG.md, shots\approve-264.png, shots\change-268.png, site-c\.hitchhiker\interview.json, brief-pending.json). Write the failing test first for each bug, then fix. All tests use a stubbed model: no Grok spawn, no billed call.

## BUG-074 (S2) "Change something" replaces a whole brief field with the raw instruction text
Run 11 typed into #brief-correction: "Motion: the home page opens with gentle motion on the hero photo only, no video file, since there is no video at launch. Action: say it once, without repeating the follow-up." After the revise, the Action field read only "say it once, without repeating the follow-up." and the Motion field lost every other fact (parallax on the hero, farm cards fading in at about 400 ms, still under reduced motion, the branching story, no 3D). Cause: packages/engine/src/guide/brief-loop.ts applyNamedEdits/namedBriefEdits overwrite any "Heading: text" field with the literal text after the model revise, so a scoped instruction becomes the field value.

Do:
1. "Heading: text" scopes the change to that field. The model revises that field by applying the text to the current field value and keeps every fact in the field that the text does not change or remove. Do not overwrite the field with the instruction text after a successful revise.
2. A literal replacement happens only when the text clearly reads as a new value rather than an instruction (for example a short value with no imperative such as "Budget: 50 dollars"), and the revise output still wins when it already contains that value. Pick one clear rule, document it in a short comment, and test it.
3. If both revise calls fail, keep the field as it was under correction and show the existing plain error with Retry. Never write the instruction text into the field as a fallback.
4. Tests (stubbed think): the exact Run 11 correction above keeps the Motion facts (parallax, 400 ms fade, reduced motion, no 3D) and drops the film, and Action reads as one clean sentence about the prefilled inquiry; "Budget: 50 dollars" still sets Budget; a double revise failure leaves both fields unchanged.

## BUG-070 (S3) The Guide's closing recap asks a question nobody can answer
After DP-9.5 the transcript ended with "Here is what I heard. ... You said the home page is a short calm film, and you also said no video at launch. Should I treat the film as gentle motion only, with no video file? Answer, Suggest for me, or Skip. Skipping is allowed." The desk showed "Interview done (61 of 61)" and the "Guide Entry is next." card (packages/app/src/card.ts DONE_TITLE) with no draft box and no Answer, Suggest for me or Skip button, so the question could not be answered and the contradiction went into the brief (Motion says "short calm film", Imagery says "No video at launch").

Do: when the closing recap ends with an open question, keep one answerable card for it (draft box, Answer, Suggest for me, Skip) before the done card. The answer is saved to the question that caused the conflict (here DP-6.4/DP-6.6 motion) and the brief uses it. Skip shows the done card and the brief draft carries the conflict as one plain sentence in the field (not silently both). A recap with no open question goes straight to the done card as today. Tests: an engine test with a recap that asks a question leaves the session open with that question; an app render or e2e test that the card has the three controls; answering it updates the field and then shows "Guide Entry is next.".

## BUG-071 (S3) An identical follow-up answer is stored twice and the brief field is cut mid-sentence
DP-2.2 was asked a follow-up and got the same text. interview.json stores "...prefilled with that farm ID.\nFollow-up: Send an inquiry about one farm they can see; the form is prefilled with that farm ID." (packages/engine/src/guide/session-state.ts FOLLOW_UP_MARK). The brief Action then read "Send an inquiry about one farm they can see. The form is prefilled with that farm ID. The follow-up is the same action: with the form", which repeats itself and stops mid-sentence.

Do:
1. When a follow-up answer matches the stored answer after normalizing case, spacing and punctuation, do not append a Follow-up part; keep the answer once.
2. Brief field text never ends mid-sentence: when a field is shortened, cut at a sentence end, or drop the trailing fragment.
3. Tests: a duplicate follow-up leaves a single answer; the deterministic brief for that value reads as complete sentences; a shortened field ends with terminal punctuation.

## BUG-073 (S3) The launch card suggests Hostinger when the brief names Cloudflare Pages
The brief Hosting field reads "No web address yet. Use paradisefound.farm, hosted on Cloudflare Pages (free tier)." but the Launch card says "Hostinger is the suggested host." (packages/app/src/approval.ts data-launch-host; same text in packages/cli/src/commands/so-long.ts).

Do: when the brief Hosting field names a host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, Hostinger and other hosts the deploy package already knows), the Launch card and `hh so-long` suggest that host and its cost line follows it; Hostinger stays the suggestion only when no host is named. Update the existing tests (launch-card-245d.spec.ts, so-long-243.test.ts) to cover both cases rather than loosening them.

## Done when
pnpm typecheck, lint, the touched packages' tests and the new or updated e2e pass. Do not touch other bugs. Never loosen or delete an existing assertion to make it pass.

## Commit
```
fix(app,engine): Desk Run 11 brief fixes for scoped changes, recap question, follow-ups and suggested host (243b)
```