import assert from "node:assert/strict";
import { test } from "node:test";
import { designLanguageFor, type DesignLibrary } from "../src/spec/design-language.ts";
import type { SitePromptSkeleton } from "../src/spec/site-prompts.ts";

test("a stale pack is left out and the remix line stays", () => {
  const library: DesignLibrary = {
    goldenDir: "golden",
    recipes: "",
    gallery: [],
    assetsMarkdown: "",
    facts: "The valley is the only place named.",
    styleText: "",
    packs: [
      { name: "old", stale: true, excerpt: "This stale pack must stay out of the prompt." },
      { name: "live", stale: false, excerpt: "A live pack note stays in the prompt." },
    ],
  };
  const text = designLanguageFor(prompt(), "Calm editorial.", library);
  assert.match(text, /Take the thinking, not the skin\./);
  assert.match(text, /do not reproduce an entry/);
  assert.equal(text.includes("stale pack must stay out"), false);
  assert.match(text, /live pack note stays/);
});

function prompt(): SitePromptSkeleton {
  return {
    id: "001",
    title: "Art-direct the hero section: home",
    kind: "build",
    route: "/",
    filesModified: ["src/pages/index.astro"],
    requirements: ["REQ-STRUCT-hero"],
    acceptance: ["The hero is readable."],
  };
}
