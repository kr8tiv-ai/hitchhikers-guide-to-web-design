# Goal

Add the credits module and the credits page.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Credits page

Create a typed list of { name, author, license, link, usedFor, category }, with categories Code and libraries, 3D models, Textures and HDRIs, Fonts, Inspiration. Build the credits route from it: a calm page with one intro line, then each category as a clean list with the name linked to the source and the license linked. Seed it with everything that ships to the browser. Add a small Credits link in the footer. Anything borrowed gets an entry in the same commit. Edit {{files}} for {{page}}. {{section}} is the credits list. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Every borrowed asset in the commit has a credits entry.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not ship a model, font, or photo that is missing from the list.
- Do not paste site-rules.ts into this prompt.

# Verify

Open the credits route and match each row to a file that ships.

<objective>
Add the credits module and the credits page.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Credits page

Create a typed list of { name, author, license, link, usedFor, category }, with categories Code and libraries, 3D models, Textures and HDRIs, Fonts, Inspiration. Build the credits route from it: a calm page with one intro line, then each category as a clean list with the name linked to the source and the license linked. Seed it with everything that ships to the browser. Add a small Credits link in the footer. Anything borrowed gets an entry in the same commit. Edit {{files}} for {{page}}. {{section}} is the credits list. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- Every borrowed asset in the commit has a credits entry.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not ship a model, font, or photo that is missing from the list.
</must_haves>

<verify>
Open the credits route and match each row to a file that ships.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
