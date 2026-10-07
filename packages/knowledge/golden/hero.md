# Goal

Build the homepage hero with real copy and no effect library.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Homepage hero

Build the homepage hero in {{files}}. Full viewport height. Background from the approved still, with a poster image so something shows instantly. Headline in the display font, very large, low-left, with generous empty space. One line under it. One button linking to the approved URL. Text must pass contrast over the image (add a soft dark gradient behind it if needed). On mobile, use the still image, not the video. {{page}} holds {{section}}. Do not import {{library}} onto {{element}}. No effects yet; motion comes in a later prompt.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- The hero is full viewport, readable on the still, and still on the phone.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add scroll video, a WebGL context, or a second headline.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} at 375 and at 1440. Read the headline. Confirm nothing animates.

<objective>
Build the homepage hero with real copy and no effect library.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Homepage hero

Build the homepage hero in {{files}}. Full viewport height. Background from the approved still, with a poster image so something shows instantly. Headline in the display font, very large, low-left, with generous empty space. One line under it. One button linking to the approved URL. Text must pass contrast over the image (add a soft dark gradient behind it if needed). On mobile, use the still image, not the video. {{page}} holds {{section}}. Do not import {{library}} onto {{element}}. No effects yet; motion comes in a later prompt.
</task>

<must_haves>
truths:
- The hero is full viewport, readable on the still, and still on the phone.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add scroll video, a WebGL context, or a second headline.
</must_haves>

<verify>
Load {{page}} at 375 and at 1440. Read the headline. Confirm nothing animates.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
