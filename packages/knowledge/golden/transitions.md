# Goal

Add one page transition and re-init the motion clock after navigation.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Page transitions

Add a custom transition between pages: a thin line in the accent color sweeps across the screen, the old page fades and lifts 20px, the new page rises in, about 700ms total. The logo and nav persist without flicker. Re-initialize the motion clock after each navigation (kill old triggers, then refresh). Reduced motion: a plain quick fade. When the stack is Astro, use View Transitions (ClientRouter). Edit {{files}} for {{page}}. {{section}} is the outlet. Import only {{library}} on {{element}}. Do not also bind this element with another library.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Navigation lasts about 700ms and reduced motion is a short fade.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not re-init a library this page does not already use.
- Do not paste site-rules.ts into this prompt.

# Verify

Open a second route and return. Confirm the nav does not flicker.

<objective>
Add one page transition and re-init the motion clock after navigation.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Page transitions

Add a custom transition between pages: a thin line in the accent color sweeps across the screen, the old page fades and lifts 20px, the new page rises in, about 700ms total. The logo and nav persist without flicker. Re-initialize the motion clock after each navigation (kill old triggers, then refresh). Reduced motion: a plain quick fade. When the stack is Astro, use View Transitions (ClientRouter). Edit {{files}} for {{page}}. {{section}} is the outlet. Import only {{library}} on {{element}}. Do not also bind this element with another library.
</task>

<must_haves>
truths:
- Navigation lasts about 700ms and reduced motion is a short fade.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not re-init a library this page does not already use.
</must_haves>

<verify>
Open a second route and return. Confirm the nav does not flicker.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
