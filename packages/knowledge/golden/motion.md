# Goal

Add one effect on {{element}} by importing only {{library}}.

{{library}} is one MotionLib name. Allowed values: `gsap`, `lenis`, `three`, `ogl`, `motion`, `anime`, `theatre`, `css-scroll`, `vanilla`.

# Files

- The component or script that renders {{element}}
- src/scripts/motion.ts, for shared eases, durations, and the prefers-reduced-motion check
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: One effect on {{element}}

Import only {{library}} for {{element}}. Do not import a second motion library for this effect. If {{library}} is `css-scroll` or `vanilla`, add no package. If {{library}} is `theatre`, import `@theatre/core` only, pinned. Do not import `@theatre/studio`. Otherwise import the one package {{library}} names, and no other library from the motion toolkit.

Motion must feel confident and quick but never bouncy: short eases, respect prefers-reduced-motion, animate only transform and opacity.

Stagger related elements, never animate everything at once, animate only transform and opacity, and make sure reduced motion gets a calm, complete version. Each animation plays once. Reduced motion: everything is simply visible.

On a phone, keep the same story in a calm form. Do not add a second scroll owner or a second WebGL context.

No em dashes, no exclamation points. Never write "as before" or "see above".

# must_haves

truths:

- {{element}} has one effect, and that effect imports only {{library}}.
- Reduced motion is simply visible and still complete.
- The phone version stays calm.

artifacts:

- The file that mounts {{library}} on {{element}}
- A prefers-reduced-motion path beside that effect

key_links:

- The new import for {{element}} is {{library}} and no other MotionLib.
- Allowed {{library}} names are `gsap`, `lenis`, `three`, `ogl`, `motion`, `anime`, `theatre`, `css-scroll`, and `vanilla`.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not import a motion library other than {{library}}.
- Do not animate layout. Animate only transform and opacity.
- Do not add a second effect on {{element}}.
- Do not paste site-rules.ts into this prompt.

# Verify

Scroll {{element}} into view, then repeat with prefers-reduced-motion. Confirm the import list adds only {{library}}, the effect plays once, and reduced motion is simply visible.

<objective>
Add one effect on {{element}} by importing only {{library}}.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
On {{page}}, in {{section}}, edit {{files}}. Import only {{library}} for {{element}}. Do not also bind this element with another library. Motion must feel confident and quick but never bouncy: short eases, respect prefers-reduced-motion, animate only transform and opacity. Reduced motion: everything is simply visible.
</task>

<must_haves>
truths:
- {{element}} has one effect, and that effect imports only {{library}}.
artifacts:
- {{files}}
key_links:
- The new import for {{element}} is {{library}} and no other MotionLib.
prohibitions:
- Do not import a motion library other than {{library}}.
</must_haves>

<verify>
Scroll {{element}} into view, then repeat with prefers-reduced-motion. Confirm the import list adds only {{library}}.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
