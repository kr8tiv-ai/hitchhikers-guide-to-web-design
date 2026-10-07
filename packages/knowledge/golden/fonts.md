# Goal

Add the brand font files and the font-face rules.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Fonts

Copy the brand fonts into /public/fonts with @font-face rules in a global CSS file. Preload the two brand fonts. Use only those families on {{section}} of {{page}}. Edit {{files}}. Do not import {{library}} onto {{element}}.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The page renders with the brand font files, not a fallback stack.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a font the brand did not supply.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} and confirm the computed family matches the font-face rule.

<objective>
Add the brand font files and the font-face rules.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Fonts

Copy the brand fonts into /public/fonts with @font-face rules in a global CSS file. Preload the two brand fonts. Use only those families on {{section}} of {{page}}. Edit {{files}}. Do not import {{library}} onto {{element}}.
</task>

<must_haves>
truths:
- The page renders with the brand font files, not a fallback stack.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a font the brand did not supply.
</must_haves>

<verify>
Load {{page}} and confirm the computed family matches the font-face rule.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
