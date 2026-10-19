# Goal

Art-direct and place the image set: use the supplied image if it fits, otherwise the generated set.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Imagery

Place the approved image for {{section}} on {{page}} in {{files}}. Crop for intent: leave calm space where text sits, and make sure the image reads at phone size. If no supplied image fits, place the generated concept set. A real person, place, product or listing is never generated. Alt text states what the picture shows. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The section shows the supplied image or the generated concept set.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- A real person, place, product or listing is never generated.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} at 375. Confirm the image has alt text and is the supplied still or the generated concept set.

<objective>
Art-direct and place the image set: use the supplied image if it fits, otherwise the generated set.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Imagery

Place the approved image for {{section}} on {{page}} in {{files}}. Crop for intent: leave calm space where text sits, and make sure the image reads at phone size. If no supplied image fits, place the generated concept set. A real person, place, product or listing is never generated. Alt text states what the picture shows. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The section shows the supplied image or the generated concept set.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- A real person, place, product or listing is never generated.
</must_haves>

<verify>
Load {{page}} at 375. Confirm the image has alt text and is the supplied still or the generated concept set.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
