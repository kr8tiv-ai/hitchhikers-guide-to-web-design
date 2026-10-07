# Goal

Mount one Three.js scene on desktop, with a still everywhere else.

# Files

- {{files}}
- Slots: {{library}} {{element}} {{page}} {{section}} {{anchor}} {{files}}

Apply the shared RULES in packages/engine/src/spec/site-rules.ts by path. Do not paste that file into this prompt, so the rules cannot drift.

# Steps

TASK: 3D scene

Install three. Build the scene module and mount it in {{section}} on desktop only (1024px and up, fine pointer). Light it with a free HDRI from Poly Haven (polyhaven.com, CC0) for real reflections, ACES or AgX tone mapping, soft shadows. The camera moves with scroll progress through the section. One renderer only, pixel ratio capped at 2, rendering paused when the section is offscreen or the tab is hidden. Mobile, low-power devices and reduced motion get a still image rendered from the same scene. Load models through one shared GLTFLoader with Draco and Meshopt support, and leave a drop-in folder /public/models/custom/ so the model can be replaced later without code changes. Add every model, texture and HDRI to the credits data. Edit {{files}} for {{page}}. Import only {{library}} on {{element}}. Do not also bind this element with another library.

Never write "as before", "see above", or "same as previous".
No em dashes, no exclamation points.

# must_haves

truths:

- One renderer runs on desktop and pauses offscreen. The phone shows a still.

artifacts:

- {{files}}

key_links:

- This prompt cites @.hitchhiker/CONTEXT.md#{{anchor}} and edits {{files}} on {{page}}.
- RULES are the text of packages/engine/src/spec/site-rules.ts, referenced, not copied.

prohibitions:

- Do not add a second WebGL context, and do not import a model with no credit.
- Do not paste site-rules.ts into this prompt.

# Verify

Load {{page}} at 1440 and at 375. Confirm one canvas on desktop and a still on the phone.

<objective>
Mount one Three.js scene on desktop, with a still everywhere else.
</objective>

<read_first>
@.hitchhiker/CONTEXT.md#{{anchor}}
</read_first>

<task>
TASK: 3D scene

Install three. Build the scene module and mount it in {{section}} on desktop only (1024px and up, fine pointer). Light it with a free HDRI from Poly Haven (polyhaven.com, CC0) for real reflections, ACES or AgX tone mapping, soft shadows. The camera moves with scroll progress through the section. One renderer only, pixel ratio capped at 2, rendering paused when the section is offscreen or the tab is hidden. Mobile, low-power devices and reduced motion get a still image rendered from the same scene. Load models through one shared GLTFLoader with Draco and Meshopt support, and leave a drop-in folder /public/models/custom/ so the model can be replaced later without code changes. Add every model, texture and HDRI to the credits data. Edit {{files}} for {{page}}. Import only {{library}} on {{element}}. Do not also bind this element with another library.
</task>

<must_haves>
truths:
- One renderer runs on desktop and pauses offscreen. The phone shows a still.
artifacts:
- {{files}}
key_links:
- {{files}} is the work of this prompt for {{section}}.
prohibitions:
- Do not add a second WebGL context, and do not import a model with no credit.
</must_haves>

<verify>
Load {{page}} at 1440 and at 375. Confirm one canvas on desktop and a still on the phone.
</verify>

<report_back>
At most 150 words. Name the files, what changed, and anything assumed.
</report_back>

<commit>
feat(site): {{section}}
</commit>

Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.
