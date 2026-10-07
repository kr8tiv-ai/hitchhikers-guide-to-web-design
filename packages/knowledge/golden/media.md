# Goal

Compress images and video and record the weight.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Media and performance pass

Find every image and video used by {{section}} on {{page}}. Images: export AVIF and WebP at 1280, 1920 and 2560 widths and serve them with sizes. Videos: encode a WebM (AV1) and an MP4 (H.264, crf 23, -movflags +faststart, no audio), each loop under about 4 MB where possible, with a poster frame. Video tags: muted, playsinline, loop, preload="metadata". Mobile and save-data users get the poster only. Keep originals in /_archive/originals. Edit {{files}}. Do not import {{library}} onto {{element}}. Report a before and after size table. Target: LCP under 2.5s, no layout shift.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Hero media stays under the budget and the phone gets a poster.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not leave an uncompressed original in the shipped path.
- Do not paste site-rules.ts into this prompt.

# Verify

Compare file sizes before and after. Confirm the phone source is the poster or the small candidate.

<objective>
Compress images and video and record the weight.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Media and performance pass

Find every image and video used by {{section}} on {{page}}. Images: export AVIF and WebP at 1280, 1920 and 2560 widths and serve them with sizes. Videos: encode a WebM (AV1) and an MP4 (H.264, crf 23, -movflags +faststart, no audio), each loop under about 4 MB where possible, with a poster frame. Video tags: muted, playsinline, loop, preload="metadata". Mobile and save-data users get the poster only. Keep originals in /_archive/originals. Edit {{files}}. Do not import {{library}} onto {{element}}. Report a before and after size table. Target: LCP under 2.5s, no layout shift.
</task>

<must_haves>
truths:
- Hero media stays under the budget and the phone gets a poster.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not leave an uncompressed original in the shipped path.
</must_haves>

<verify>
Compare file sizes before and after. Confirm the phone source is the poster or the small candidate.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
