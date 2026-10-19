# Goal

Grade the images so the site feels like one world.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Imagery pass

Audit every image and video on {{section}} against the visual direction (light, color grade, subject, what never shows up). List anything off-brand, generic or stock-looking. Replace weak, generic or missing images with art-directed generated ones through the asset step, and improve crop and grade. A real person, place, product or listing is never generated. Crop for intent: make sure every image leaves calm space where text sits, and that the hero image reads at phone size. Apply one consistent color treatment so the whole site feels like one world. This pass may add a section treatment, an effect, or an image when it serves the art direction. Report the list. Edit {{files}} for {{page}}. Rank the changes.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Weak, generic or missing images are replaced through the asset step, and crop and grade match the art direction.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- A real person, place, product or listing is never generated.
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

Audit every image and video on {{section}} against the visual direction (light, color grade, subject, what never shows up). List anything off-brand, generic or stock-looking. Replace weak, generic or missing images with art-directed generated ones through the asset step, and improve crop and grade. A real person, place, product or listing is never generated. Crop for intent: make sure every image leaves calm space where text sits, and that the hero image reads at phone size. Apply one consistent color treatment so the whole site feels like one world. This pass may add a section treatment, an effect, or an image when it serves the art direction. Report the list. Edit {{files}} for {{page}}. Rank the changes.
</task>

<must_haves>
truths:
- Weak, generic or missing images are replaced through the asset step, and crop and grade match the art direction.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- A real person, place, product or listing is never generated.
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
