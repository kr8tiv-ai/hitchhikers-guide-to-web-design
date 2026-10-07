# Goal

Scrub one hero video with scroll, and keep a still on the phone.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: Scroll-scrubbed hero video

Build the scrub section in {{files}} for {{section}} on {{page}}. A section about 400vh tall with a sticky full-screen stage. As the visitor scrolls, the video plays forward frame by frame, and backwards when they scroll up, using GSAP ScrollTrigger with scrub: true. Re-encode for smooth seeking with ffmpeg: H.264, keyframe every frame (-g 1), no audio (-an), 1920px wide, -movflags +faststart, and keep the original in /_archive. If seeking still stutters, extract frames to WebP (about 120 to 180 frames) and draw them to a canvas instead. Overlay three lines of copy that fade in at 20, 50 and 80 percent progress. Poster image first. Mobile and reduced motion get the poster and the copy, no scrubbing. Import only {{library}} on {{element}}. Do not also bind this element with another library.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- Desktop scrub moves forward and back. Phone and reduced motion show the poster.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not scrub on a phone, and do not add a second video.
- Do not paste site-rules.ts into this prompt.

# Verify

Scroll the stage at 1440, then at 375. Confirm the phone shows the poster only.

<objective>
Scrub one hero video with scroll, and keep a still on the phone.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: Scroll-scrubbed hero video

Build the scrub section in {{files}} for {{section}} on {{page}}. A section about 400vh tall with a sticky full-screen stage. As the visitor scrolls, the video plays forward frame by frame, and backwards when they scroll up, using GSAP ScrollTrigger with scrub: true. Re-encode for smooth seeking with ffmpeg: H.264, keyframe every frame (-g 1), no audio (-an), 1920px wide, -movflags +faststart, and keep the original in /_archive. If seeking still stutters, extract frames to WebP (about 120 to 180 frames) and draw them to a canvas instead. Overlay three lines of copy that fade in at 20, 50 and 80 percent progress. Poster image first. Mobile and reduced motion get the poster and the copy, no scrubbing. Import only {{library}} on {{element}}. Do not also bind this element with another library.
</task>

<must_haves>
truths:
- Desktop scrub moves forward and back. Phone and reduced motion show the poster.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not scrub on a phone, and do not add a second video.
</must_haves>

<verify>
Scroll the stage at 1440, then at 375. Confirm the phone shows the poster only.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
