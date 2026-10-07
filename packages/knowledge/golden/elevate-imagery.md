# Goal

Grade the images so the site feels like one world.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Imagery pass

Audit every image and video on {{section}} against the visual direction (light, color grade, subject, what never shows up). List anything off-brand, generic or stock-looking. For each, write a replacement prompt and leave a clearly named placeholder slot. Do not invent a photo in the page. Crop for intent: make sure every image leaves calm space where text sits, and that the hero image reads at phone size. Apply one consistent color treatment so the whole site feels like one world. Report the list. Edit {{files}} for {{page}}. Do not import {{library}} onto {{element}}. At most eight ranked changes.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Off-brand images are listed, and missing art stays a named slot.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not invent a photo or a person.
- Do not paste site-rules.ts into this prompt.

# Verify

Open {{page}} at 375 and confirm the hero image still leaves room for the headline.

<objective>
Grade the images so the site feels like one world.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Imagery pass

Audit every image and video on {{section}} against the visual direction (light, color grade, subject, what never shows up). List anything off-brand, generic or stock-looking. For each, write a replacement prompt and leave a clearly named placeholder slot. Do not invent a photo in the page. Crop for intent: make sure every image leaves calm space where text sits, and that the hero image reads at phone size. Apply one consistent color treatment so the whole site feels like one world. Report the list. Edit {{files}} for {{page}}. Do not import {{library}} onto {{element}}. At most eight ranked changes.
</task>

<must_haves>
truths:
- Off-brand images are listed, and missing art stays a named slot.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not invent a photo or a person.
</must_haves>

<verify>
Open {{page}} at 375 and confirm the hero image still leaves room for the headline.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
