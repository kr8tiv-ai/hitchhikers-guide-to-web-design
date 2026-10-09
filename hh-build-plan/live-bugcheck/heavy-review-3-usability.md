# SuperGrok Heavy review #3: desk usability (from Matt, Oct 9 1:12 AM CR)
Direction: don't restyle. Keep the cream editorial desk, the rust rule and the Don't Panic wordmark. The pass covers progress, a sticky composer, honest buttons, and empty states that point at one next click.

## Findings
1. The question is printed twice (heading plus card title). Drop the heading; the card title is the page title.
2. Shrink DON'T PANIC to a one-line mast after the first answer ("Don't Panic · DP-0.2") so the card stays in the first viewport.
3. Pin the composer (textarea, Answer, Suggest, Skip) to the bottom of the viewport on small screens; the why-text can scroll away.
4. Progress on the card kicker: "DP-0.2 · 2 of 22 · Don't Panic", plus a second count for required questions still open (a skip isn't done).
5. Make the map phases links (Desk, Brand, Approvals, Drive) with aria-current="step". Under 720px, collapse the map to "Don't Panic · 2/22" plus a disclosure.
6. Footer: show the next action only ("Saved · DP-0.2 · 20 left"), not the repeated "Guide is quiet" text.
7. Buttons: Answer is the only filled button, enabled when the draft has text. Enter submits and Shift+Enter adds a newline, with a hint under the field. Suggest reads "Suggest — I'll mark it as assumed". Skip reads "Skip — we'll assume" and shows the assumption on the next card; ask for confirmation if the field is required.
8. Textarea placeholder with one example answer.
9. Hold to talk becomes a mic beside the field, off the primary row. Disable it outside Chrome/Edge with the message "Talk needs Chrome or Edge".
10. Empty /brand gets one button, "Approve the brief to print the kit", plus a link back to the open question.
11. Drive (/hh-dashboard): grey the Pause, Approve, Elevate and Deploy gates until something is actionable (Pause is currently only aria-disabled). Replace the empty headings with "No queue yet. The plan lands here after you approve the prompts." Remove "Not xAI's agent dashboard".
12. A fresh desk shows a "Start the interview" button instead of "No question yet".
13. After a submit, move focus to the new question heading and announce the latest Guide turn in an aria-live="polite" region (innerHTML swaps are currently silent).
14. A save error must not replace the card. Show the error under the field and keep the draft.
15. Transcript shows the last three turns, with the rest behind "Earlier".
16. Previous answers in the log get an Edit action.
17. Logo questions say "drop it here" but there's no file input. Add a drop zone for those question ids, or change the copy.
18. Accessibility: --color-focus is the same as --color-accent (#8e2f1a light, #e6a15c dark), so the focus ring disappears on Answer. Give focus its own ring: ink on light, light cream on dark.
19. The German restatement in the static comp is off by default, behind a "Read this in…" toggle.
20. Put Settings in one Desk menu (voice, model, effort, xAI speech rate), not as a seventh nav item. Show the $0.10/hr and $0.20/hr quote before xAI STT can be enabled. Merge with review #2 item 8.

## Heavy's Grok 4.7 prompt (verbatim intent)
Improve desk usability in packages/app without a new visual system. Keep the cream editorial desk, the rust rule and the Don't Panic wordmark. In the live desk (routes.ts, card.ts, client/desk.ts):
- Show the question once, and put "DP-0.2 · 2 of N" on the card.
- Make the map phases links with aria-current="step", and collapse the map under 720px.
- Pin Answer, Suggest and Skip to the bottom on small screens. Answer stays the only filled button; Enter submits and Shift+Enter adds a newline.
- Relabel Suggest and Skip so each says it writes a marked assumption.
- Disable Hold to talk outside Chromium and move it off the primary row.
- Give the empty /brand, /approve and /hh-dashboard one next-action button instead of a stack of empty plates.
- Don't wipe the card on a save error. Move focus to the new question heading and add aria-live="polite" on the latest turn.
- Split --color-focus from --color-accent.
- Add a test that the card shows the count and that an empty brand plate links back to the open question.
