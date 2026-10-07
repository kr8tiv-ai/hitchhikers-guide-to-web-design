/**
 * Sens-O-Matic imagery rules and still prompt stubs.
 * Stubs name a model and a size. They do not call Imagine.
 * People, products, and places already in hand are do-not-replace.
 * Rewritten from Matt's imagery method (guide prompt 12), with credit. D-005.
 *
 * The fresh-session note also describes buildImagery({ answers, palette })
 * and a DP-7.1 resolution switch. The interface in this prompt is the one
 * implemented: protected notes, vibe, and palette name. A cinematic or 1080
 * word in those fields does not select a video model or a video frame size.
 */

export class ImageryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageryError";
  }
}

export interface ImageStub {
  id: string;
  model: string;
  resolution: string;
  prompt: string;
  replacesReal: false;
}

/** Still model on the xAI price card. Not a video id. */
export const STILL_MODEL = "grok-imagine-image";

/** Still size. 1080p is a video frame and is never written here. */
export const STILL_RESOLUTION = "1k";

export const IMAGERY_ROTATION = [
  "place",
  "material",
  "tool",
  "hand-without-a-face",
  "detail",
] as const;

export type ImagerySubject = (typeof IMAGERY_ROTATION)[number];

const TAIL = "no text, no watermark, no logo letters, no faces";
const VIBE_LIMIT = 80;
const EMPTY_PROTECTED = "Nothing is marked protected yet.";

const FORBIDDEN = ["replace the person", "looks like the uploaded photo of"] as const;

const SCENES: Record<ImagerySubject, string> = {
  place:
    "A wide still of the place where the work happens, three-quarter view, calm empty space on the left",
  material:
    "A close still of the material itself, grain filling the frame, calm empty space along the top",
  tool: "A still of the tool at rest on the bench, slight overhead angle, calm empty space on the right",
  "hand-without-a-face":
    "A still of one hand at the work, cropped at the wrist, head out of frame, calm empty space below",
  detail: "A tight still of one small detail of the craft, level camera, calm empty space in a corner",
};

export interface ImageryInput {
  protectedNotes: string;
  vibe: string;
  paletteName: string;
}

/**
 * buildImagery writes the guide and three to six still stubs.
 * The second argument is the subject rotation. It defaults to the fixed five.
 * An empty rotation throws. Callers with one argument use that default.
 */
export function buildImagery(
  input: ImageryInput,
  rotation: readonly string[] = IMAGERY_ROTATION,
): { markdown: string; stubs: ImageStub[] } {
  const subjects = checkedRotation(rotation);
  const stubs: ImageStub[] = [];
  for (const [index, subject] of subjects.entries()) {
    const stub = makeStub(input, subject, index);
    assertNoRealReplacement(stub);
    stubs.push(stub);
  }
  return { markdown: renderGuide(input, stubs), stubs };
}

/** Throws when a stub would stand in for a real person. */
export function assertNoRealReplacement(stub: ImageStub): void {
  const haystack = stub.prompt.toLowerCase();
  for (const phrase of FORBIDDEN) {
    if (haystack.includes(phrase)) {
      throw new ImageryError(`Stub ${stub.id} asks to replace a real person.`);
    }
  }
  if (stub.replacesReal) {
    throw new ImageryError(`Stub ${stub.id} is marked replacesReal.`);
  }
}

function checkedRotation(rotation: readonly string[]): ImagerySubject[] {
  if (rotation.length === 0) {
    throw new ImageryError("The imagery rotation is empty.");
  }
  if (rotation.length < 3 || rotation.length > 6) {
    throw new ImageryError("The imagery rotation must hold three to six subjects.");
  }
  const subjects: ImagerySubject[] = [];
  for (const subject of rotation) {
    if (isFaceSubject(subject)) {
      throw new ImageryError("A face stub is not allowed.");
    }
    if (!isSubject(subject)) {
      throw new ImageryError(`Unknown imagery subject: ${subject}.`);
    }
    subjects.push(subject);
  }
  return subjects;
}

function isSubject(value: string): value is ImagerySubject {
  return (IMAGERY_ROTATION as readonly string[]).includes(value);
}

function isFaceSubject(subject: string): boolean {
  if (subject === "hand-without-a-face") return false;
  return subject.toLowerCase() === "portrait" || /\bface\b/i.test(subject);
}

function makeStub(input: ImageryInput, subject: ImagerySubject, index: number): ImageStub {
  const vibe = clipVibe(input.vibe);
  const mood = vibe.length > 0 ? vibe : "none given";
  const prompt = [
    `Subject: ${subject}.`,
    `${SCENES[subject]}.`,
    `Mood: ${mood}.`,
    `Grade: ink in the shadows and paper in the open light, palette ${promptPalette(input.paletteName)}.`,
    "Still photograph, not a clip.",
    TAIL,
  ].join(" ");
  return {
    id: `img-${String(index + 1).padStart(2, "0")}`,
    model: STILL_MODEL,
    resolution: STILL_RESOLUTION,
    prompt,
    replacesReal: false,
  };
}

/** Quotes are removed, then the prompt copy is clipped. The guide keeps the full vibe. */
function clipVibe(vibe: string): string {
  const flat = vibe.replace(/["'`!]/g, "").replace(/\s+/g, " ").trim();
  if (flat.length <= VIBE_LIMIT) return flat;
  return flat.slice(0, VIBE_LIMIT).trimEnd();
}

function promptPalette(name: string): string {
  const flat = name.replace(/["'`!]/g, "").replace(/\s+/g, " ").trim();
  return flat.length > 0 ? flat : "unnamed";
}

function renderGuide(input: ImageryInput, stubs: ImageStub[]): string {
  const vibe = stripBang(input.vibe);
  const palette = stripBang(input.paletteName);
  const vibeLine = vibe.length > 0 ? vibe : "No vibe was given.";
  const paletteLine = palette.length > 0 ? palette : "unnamed";
  const parts = [
    "# Imagery",
    "",
    "Photograph the work that already exists. Fill only the holes. People, products, and places already in hand are marked do-not-replace.",
    "",
    section(
      "Photograph",
      [
        "- Place: the real room, street, or bench where the work happens.",
        "- Material: the stuff itself, close enough to read the grain.",
        "- Tool: the tool at rest, not a catalog pack shot.",
        "- Hand: one hand at the work, cropped at the wrist, head out of frame.",
        "- Detail: one small trace of the craft.",
        "",
        `Light and time of day follow the vibe: ${vibeLine}`,
        `Color grade uses ink for the shadow and paper for the open light. Palette name: ${paletteLine}.`,
        "Leave a calm empty area where type can sit later. The picture itself holds no type.",
      ].join("\n"),
    ),
    section(
      "Never generate",
      [
        "- A face, a portrait, or anyone who could stand in for a real person.",
        "- A stand-in for a real product, place, or piece of work.",
        "- Letters, a logo, or a watermark.",
        "- A made-up customer line set in type on a picture.",
      ].join("\n"),
    ),
    section("Protected", protectedBody(input.protectedNotes)),
    section(
      "Stubs",
      [
        `Still prompts only. Model ${STILL_MODEL}. Resolution ${STILL_RESOLUTION}.`,
        "If the vibe says cinematic or 1080, the still model stays and the size stays 1k. These stubs are not clips, and they do not call Imagine.",
        "",
        stubs
          .map((stub) => `### ${stub.id}\n\nModel: ${stub.model}. Resolution: ${stub.resolution}.\n\n${stub.prompt}`)
          .join("\n\n"),
      ].join("\n"),
    ),
  ];
  return parts.join("\n");
}

function protectedBody(notes: string): string {
  const cleaned = stripBang(notes);
  if (cleaned.length === 0) return EMPTY_PROTECTED;
  return cleaned
    .split(/\r\n|\n|\r/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function stripBang(value: string): string {
  return value.replace(/!/g, "").trim();
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}\n`;
}
