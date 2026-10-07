# Goal

Add one soft glow, CSS first, one shader only if the library is ogl.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Title glow

On desktop, the heading {{element}} in {{section}} gets a soft glow that heats up on hover: a blurred radial gradient in the accent color at low opacity, easing in over about 1.2s and cooling out over about 2.4s. Build it in CSS first (a ::before pseudo-element, animating only opacity and transform). Upgrade to one shared shader canvas only when {{library}} is ogl, and only if it stays under 1ms per frame. Keyboard focus triggers it too. Touch devices and reduced motion get a static faint glow or nothing. Edit {{files}} on {{page}}. Do not also bind this element with another library.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Hover and focus show one glow. Touch and reduced motion stay static.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a second canvas, and do not animate layout.
- Do not paste site-rules.ts into this prompt.

# Verify

Hover and focus the heading at 1440. Repeat with prefers-reduced-motion.

<objective>
Add one soft glow, CSS first, one shader only if the library is ogl.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Title glow

On desktop, the heading {{element}} in {{section}} gets a soft glow that heats up on hover: a blurred radial gradient in the accent color at low opacity, easing in over about 1.2s and cooling out over about 2.4s. Build it in CSS first (a ::before pseudo-element, animating only opacity and transform). Upgrade to one shared shader canvas only when {{library}} is ogl, and only if it stays under 1ms per frame. Keyboard focus triggers it too. Touch devices and reduced motion get a static faint glow or nothing. Edit {{files}} on {{page}}. Do not also bind this element with another library.
</task>

<must_haves>
truths:
- Hover and focus show one glow. Touch and reduced motion stay static.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a second canvas, and do not animate layout.
</must_haves>

<verify>
Hover and focus the heading at 1440. Repeat with prefers-reduced-motion.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
