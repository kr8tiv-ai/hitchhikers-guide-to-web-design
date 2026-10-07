import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IMAGERY_ROTATION,
  ImageryError,
  STILL_MODEL,
  STILL_RESOLUTION,
  assertNoRealReplacement,
  buildImagery,
} from "../src/brand/imagery.ts";
import type { ImageStub } from "../src/brand/imagery.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "..", "src", "brand", "imagery.ts");
const source = readFileSync(sourcePath, "utf8");

type LiteralFalse = ImageStub["replacesReal"] extends false
  ? boolean extends ImageStub["replacesReal"]
    ? never
    : true
  : never;

const replacesRealIsLiteralFalse: LiteralFalse = true;

const QUIET = { protectedNotes: "", vibe: "warm shop light", paletteName: "Kiln" };

function section(markdown: string, title: string): string {
  const marker = `## ${title}\n`;
  const start = markdown.indexOf(marker);
  assert.ok(start >= 0, title);
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  const body = next === -1 ? rest : rest.slice(0, next);
  return body.trim();
}

test("the default rotation is five stills and none of them is a face", () => {
  assert.equal(replacesRealIsLiteralFalse, true);
  assert.deepEqual(IMAGERY_ROTATION, [
    "place",
    "material",
    "tool",
    "hand-without-a-face",
    "detail",
  ]);
  const result = buildImagery(QUIET);
  assert.equal(result.stubs.length, 5);
  assert.ok(result.stubs.length >= 3 && result.stubs.length <= 6);
  result.stubs.forEach((stub, index) => {
    assert.equal(stub.id, `img-${String(index + 1).padStart(2, "0")}`);
    assert.equal(stub.model, STILL_MODEL);
    assert.equal(stub.model, "grok-imagine-image");
    assert.equal(stub.resolution, STILL_RESOLUTION);
    assert.equal(stub.resolution, "1k");
    assert.equal(stub.replacesReal, false);
    assert.equal(stub.model.includes("video"), false);
    assert.match(stub.prompt, /\bink\b/);
    assert.match(stub.prompt, /\bpaper\b/);
    assert.match(stub.prompt, /no text, no watermark, no logo letters/);
    assert.equal(stub.prompt.toLowerCase().includes("testimonial"), false);
    assert.equal(stub.prompt.toLowerCase().includes("replace the person"), false);
    assert.equal(stub.prompt.toLowerCase().includes("looks like the uploaded photo of"), false);
    assert.match(stub.prompt, /Subject: /);
    assertNoRealReplacement(stub);
  });
  const subjects = result.stubs.map((stub) => stub.prompt.match(/Subject: ([^.]+)\./)?.[1]);
  assert.deepEqual(subjects, [...IMAGERY_ROTATION]);
  assert.equal(subjects.includes("face"), false);
  assert.equal(result.markdown.includes("!"), false);
  assert.equal(section(result.markdown, "Protected"), "Nothing is marked protected yet.");
  assert.match(result.markdown, /do-not-replace/);
});

test("protected notes are quoted and an empty note uses the empty sentence", () => {
  for (const notes of ["", "   ", "\n", "!"]) {
    const result = buildImagery({ ...QUIET, protectedNotes: notes });
    assert.equal(section(result.markdown, "Protected"), "Nothing is marked protected yet.");
  }
  const notes = "founder on the door\nthe red bench";
  const result = buildImagery({ ...QUIET, protectedNotes: notes });
  const body = section(result.markdown, "Protected");
  assert.match(body, /> founder on the door/);
  assert.match(body, /> the red bench/);
  assert.equal(body.includes("Nothing is marked protected yet."), false);
  assert.equal(result.markdown.includes("!"), false);
});

test("a long vibe is clipped in the prompt only and quotes are removed there", () => {
  const vibe = `${"north ".repeat(20)}TAIL`;
  const clipped = vibe.slice(0, 80);
  const result = buildImagery({ ...QUIET, vibe });
  assert.ok(result.markdown.includes(vibe));
  for (const stub of result.stubs) {
    assert.ok(stub.prompt.includes(clipped));
    assert.equal(stub.prompt.includes("TAIL"), false);
    assert.equal(stub.prompt.includes(vibe), false);
  }
  const quoted = buildImagery({ ...QUIET, vibe: 'quiet "north" light' });
  for (const stub of quoted.stubs) {
    assert.match(stub.prompt, /quiet north light/);
    assert.equal(stub.prompt.includes('"'), false);
    assert.equal(stub.prompt.includes("'"), false);
  }
  assert.match(quoted.markdown, /quiet "north" light/);
});

test("ink and paper words stay when the palette name is only a hex", () => {
  const result = buildImagery({ ...QUIET, paletteName: "#1c1915" });
  for (const stub of result.stubs) {
    assert.match(stub.prompt, /\bink\b/);
    assert.match(stub.prompt, /\bpaper\b/);
    assert.match(stub.prompt, /#1c1915/);
  }
});

test("cinematic and 1080 budget words keep the still model and the 1k size", () => {
  const result = buildImagery({
    protectedNotes: "shop front",
    vibe: "cinematic dusk, budget mentions 1080",
    paletteName: "Kiln",
  });
  assert.match(result.markdown, /cinematic/);
  assert.match(result.markdown, /1080/);
  for (const stub of result.stubs) {
    assert.equal(stub.model, "grok-imagine-image");
    assert.equal(stub.resolution, "1k");
    assert.equal(/video/i.test(stub.model), false);
    assert.equal(/1080p|720p|480p/i.test(stub.resolution), false);
    assert.equal(stub.prompt.toLowerCase().includes("testimonial"), false);
    assert.match(stub.prompt, /Still photograph, not a clip/);
  }
});

test("assertNoRealReplacement throws on a person swap and on a lookalike line", () => {
  const base = {
    id: "img-01",
    model: "grok-imagine-image",
    resolution: "1k",
    replacesReal: false as const,
  };
  assert.throws(
    () => assertNoRealReplacement({ ...base, prompt: "Please replace the person in the doorway" }),
    ImageryError,
  );
  assert.throws(
    () =>
      assertNoRealReplacement({
        ...base,
        prompt: "It looks like the uploaded photo of the founder",
      }),
    ImageryError,
  );
  assert.doesNotThrow(() => assertNoRealReplacement({ ...base, prompt: resultPrompt() }));
});

test("an empty rotation throws and a face subject is refused", () => {
  assert.throws(() => buildImagery(QUIET, []), (error: unknown) => {
    return error instanceof ImageryError && /empty/.test(error.message);
  });
  assert.throws(() => buildImagery(QUIET, ["place", "material"]), ImageryError);
  assert.throws(
    () => buildImagery(QUIET, ["place", "material", "tool", "detail", "place", "tool", "detail"]),
    ImageryError,
  );
  assert.throws(() => buildImagery(QUIET, ["place", "material", "face"]), (error: unknown) => {
    return error instanceof ImageryError && /face stub is not allowed/.test(error.message);
  });
});

test("the module does not fetch and it checks every stub before return", () => {
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("axios"), false);
  assert.equal(source.includes("grok-imagine-video"), false);
  assert.equal(/https?:\/\//.test(source), false);
  assert.match(source, /assertNoRealReplacement\(stub\)/);
});

function resultPrompt(): string {
  const stub = buildImagery(QUIET).stubs[0];
  assert.ok(stub);
  return stub.prompt;
}
