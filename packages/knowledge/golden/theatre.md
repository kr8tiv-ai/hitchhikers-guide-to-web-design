# Goal

Bind one Theatre core timeline. Never the studio package.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Theatre timeline

Import @theatre/core only, pinned at 0.7.2, on {{element}} in {{section}} of {{page}}. Do not import @theatre/studio. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. The timeline plays once. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy. Subscribe to the shared ticker. Do not start a second animation frame loop.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The effect imports @theatre/core only, pinned, and never the studio.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add @theatre/studio or a second timeline on {{element}}.
- Do not paste site-rules.ts into this prompt.

# Verify

Search the diff for @theatre/studio. Confirm it is absent, then play the section once.

<objective>
Bind one Theatre core timeline. Never the studio package.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Theatre timeline

Import @theatre/core only, pinned at 0.7.2, on {{element}} in {{section}} of {{page}}. Do not import @theatre/studio. Edit {{files}}. Import only {{library}}. Do not also bind this element with another library. The timeline plays once. Reduced motion: everything is simply visible. Motion must feel confident and quick but never bouncy. Subscribe to the shared ticker. Do not start a second animation frame loop.
</task>

<must_haves>
truths:
- The effect imports @theatre/core only, pinned, and never the studio.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add @theatre/studio or a second timeline on {{element}}.
</must_haves>

<verify>
Search the diff for @theatre/studio. Confirm it is absent, then play the section once.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
