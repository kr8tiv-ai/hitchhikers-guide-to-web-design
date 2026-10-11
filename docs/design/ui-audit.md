# Desk UI audit

Captured before the redesign from a detached worktree at the previous desk, 12 states, widths 375, 768, and 1440, light and dark. Files live in `docs/assets/ui-before/`. The same names after the redesign are in `docs/assets/ui-after/`.

## What the first viewport showed

At 1440 and at 375 the first screen was the Don't Panic wordmark, a rust "Start the interview" button, the Desk menu, six uppercase links, and a "Resume a project" block with a second rust button, "Open project file". The question was below that. See `docs/assets/ui-before/desk-first-1440-light.png` and `docs/assets/ui-before/desk-first-375-light.png`. Dark matches: `desk-first-1440-dark.png`, `desk-first-375-dark.png`.

## Confusion points

1. The interview was not first. The wordmark, the start button, and Resume a project filled the viewport, so a first-time user could not see the question. Evidence: `docs/assets/ui-before/desk-first-375-light.png`, `docs/assets/ui-before/desk-first-1440-light.png`, and the same pair at 768. Resolved by putting the question first in `shell.ts`, compacting the mast with `.hh-mast--desk`, and removing the mast start link. The question card is the primary object.

2. Two primary buttons competed. "Start the interview" and "Open project file" were both rust, while the real next step, Answer, was below the fold. Evidence: `docs/assets/ui-before/desk-first-1440-light.png`. Resolved by one primary on the desk, the Answer button. Open project folder is secondary, in the project bar.

3. Resume a project was a second hero. The heading, the empty copy, and the sample plate sat above the question and read as the main task. Evidence: `docs/assets/ui-before/desk-first-768-light.png` and `desk-first-1440-dark.png`. Resolved by one compact project bar after the interview (`project-desk.ts`, `[data-project-slot]`). Resume project is a closed disclosure. The sample and the path field stay visible.

4. Restart did not exist. Mid-interview shots show the next question and no way back. Evidence: `docs/assets/ui-before/desk-mid-1440-light.png` and `desk-mid-375-dark.png`. Resolved by a labelled "Restart the interview" button in the card header. It opens a confirm dialog that says progress is saved. Cancel is focused. Confirm saves, then returns to the first question.

5. Settings was unlabelled as a place. It lived inside "Desk menu", and the route row was six uppercase words with no icons and no explanation. Evidence: `docs/assets/ui-before/settings-1440-light.png` (the menu is open on that page) and `desk-first-375-light.png` (the menu is a disclosure under the wordmark). Resolved by a quieter nav: Desk, Brand, Approvals, Drive, Settings, Install tools, Gallery, Motion, each with an icon, a visible label, a tooltip, and `aria-current` on the current page. Replay tour stays in the Desk menu.

6. Project actions were split. Save sat past the footer. Resume and Open sat in the hero. The resumed shot still leads with the wordmark. Evidence: `docs/assets/ui-before/desk-resumed-1440-light.png` and `desk-resumed-375-light.png`. Resolved by one bar: project name, Save project, Resume project, Open project folder.

7. Nothing explained itself. The only hint was a `title` on a saved path. Buttons, nav, and status chips had no description. Evidence: every before shot, including `docs/assets/ui-before/drive-empty-1440-light.png` and `docs/assets/ui-before/approve-empty-375-dark.png`. Resolved by `client/tooltip.ts`: `aria-describedby`, hover, keyboard focus, and a touch hold. Escape closes the tip and still reaches an open dialog, the tour, or an active microphone. The tip does not take pointer events, so it cannot cover the next control. It is not title-only.

8. Install tools had no home. The probe table lived in the transcript, so the viewport shot of that state is still the desk top. Evidence: `docs/assets/ui-before/install-tools-1440-light.png` and `install-tools-375-dark.png`. Resolved by an Install tools nav item and `/tools`, which shows the same report. The transcript table stays, so install from the desk is unchanged.

9. On a phone the nav wrapped into several rows, the composer was only sticky, and the question sat under the fold. Evidence: `docs/assets/ui-before/desk-first-375-light.png` and `desk-mid-375-light.png`. Resolved by a one-row scrolling route list, a shorter mast, and a composer pinned to the viewport bottom under 719px, with `--hh-keyboard` from `visualViewport`, in `components.css`. The mic stays beside the field, Answer is full width, and Suggest and Skip share the next row, so the question stays above that bar. The composer cannot grow past the viewport. The card stylesheet still describes the sticky rule the older tests lock.

10. The first-run tour and the menu stacked on top of an already crowded page. Evidence: `docs/assets/ui-before/desk-tour-375-light.png` and `desk-tour-1440-dark.png`. Resolved by injecting the tour after the interview, so it does not push the question down. The "Where saves live" step now points at `data-tour-spot="project"`.

11. Empty plates were quiet but the next action was unexplained, and a missing address or a broken queue looked like a different product. Evidence: `docs/assets/ui-before/brand-empty-375-light.png`, `drive-error-768-dark.png`, `gallery-empty-1440-light.png`, `missing-error-375-light.png`. Resolved by one sentence and one next action, each with a tooltip. The plates already had that sentence. The tip is the new part.

## Left open

- Gallery walk still has one "Keep this" primary on every card. Collapsing those would change the walk. See `docs/assets/ui-before/gallery-empty-1440-light.png` for the empty plate, which has a single next action.
- A printed brand kit still has one Approve primary per section. Each section is its own yes.
- Motion has no primary. The page is a set of loops and has no single commit.
- "Open project folder" posts a `.hhproject` path, the same action as the old "Open project file". The label matches the requested bar. It does not open a directory picker.

## Assumption

The visible label is "Open project folder". The request body is still the project file path. That keeps old projects opening, and it keeps the open-path tests honest.
