# Goal

Upgrade type and spacing on one pass.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Typography and spacing pass

Audit and upgrade the type and spacing on {{section}} or the whole site, as the plan says. Define one type scale (display, h1, h2, h3, body, small, caption) with real contrast between display and body, using only the brand fonts, and use it everywhere. Tighten letter spacing on big display type, loosen it on small caps. Set body text at 16 to 18px with a line length of 45 to 75 characters and line height around 1.5. Create one spacing scale and use it for every gap. Break the identical section rhythm: vary alignment, widths and empty space so each section has its own shape. Report before and after for each section in one line. Edit {{files}} for {{page}}. Do not import {{library}} onto {{element}}. At most eight ranked changes.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- One type scale and one spacing scale are used, and body text is 16 to 18px.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a font outside the brand, and do not add motion.
- Do not paste site-rules.ts into this prompt.

# Verify

Measure one body block: size, line length, and line height.

<objective>
Upgrade type and spacing on one pass.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Typography and spacing pass

Audit and upgrade the type and spacing on {{section}} or the whole site, as the plan says. Define one type scale (display, h1, h2, h3, body, small, caption) with real contrast between display and body, using only the brand fonts, and use it everywhere. Tighten letter spacing on big display type, loosen it on small caps. Set body text at 16 to 18px with a line length of 45 to 75 characters and line height around 1.5. Create one spacing scale and use it for every gap. Break the identical section rhythm: vary alignment, widths and empty space so each section has its own shape. Report before and after for each section in one line. Edit {{files}} for {{page}}. Do not import {{library}} onto {{element}}. At most eight ranked changes.
</task>

<must_haves>
truths:
- One type scale and one spacing scale are used, and body text is 16 to 18px.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a font outside the brand, and do not add motion.
</must_haves>

<verify>
Measure one body block: size, line length, and line height.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
