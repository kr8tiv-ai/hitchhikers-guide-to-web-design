import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { PlannedPage } from "../src/spec/brief-plan.ts";
import {
  FILM_CREDIT,
  ambientSoundMarkup,
  artCallsForFilm,
  filmVideoMarkup,
  filmVideoSlot,
} from "../src/spec/film-media.ts";
import { writeSectionStillPlan } from "../src/spec/section-stills.ts";
import { removeTempDir } from "./remove-temp.ts";

const motion = { score: 4, intensity: "quiet" as const, performanceCost: "low" as const, techniques: ["lenis"] };

test("a film brief adds a silent video slot and a keyboard sound control", () => {
  assert.equal(
    artCallsForFilm("The home page opens with a hero film.", {
      signatureHero: "A designed hero",
      scroll: "Soft parallax",
      motionCharacter: "calm",
      motion,
    }),
    true,
  );
  assert.equal(
    artCallsForFilm("Soft parallax and a designed hero.", {
      signatureHero: "A designed hero with a clear first frame",
      scroll: "Soft parallax",
      motionCharacter: "calm",
      motion,
    }),
    false,
  );
  const slot = filmVideoSlot({ light: "soft daylight", motion }, "hero film");
  assert.equal(slot.kind, "video");
  assert.equal(slot.generateAudio, false);
  assert.equal(slot.model, "grok-imagine-video-1.5-lite");
  assert.equal(slot.seconds, 8);
  assert.equal(slot.resolution, "720p");
  const markup = filmVideoMarkup("src/assets/generated/hero-film.mp4", "src/assets/generated/hero.webp");
  assert.match(markup, /<video autoplay muted loop playsinline/);
  assert.match(markup, new RegExp(FILM_CREDIT));
  assert.match(markup, /play\(\)/);
  const sound = ambientSoundMarkup(true);
  assert.match(sound, /<button type="button"/);
  assert.match(sound, /data-ambient-sound="off"/);
  assert.match(sound, /aria-pressed="false"/);
  assert.equal(sound.includes("autoplay"), false);
  assert.equal(ambientSoundMarkup(false), "");
  assert.equal(sound.includes("!"), false);
});

test("writeSectionStillPlan stores a video slot only when the art direction calls for a film", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-film-239-"));
  const pages: PlannedPage[] = [
    { id: "home", title: "Home", route: "/", sections: ["hero"], contentSources: [] },
  ];
  try {
    const quiet = writeSectionStillPlan(dir, "# Site Brief\n\nCalm editorial.\n", [], pages);
    assert.equal(quiet.videos.length, 0);
    const film = writeSectionStillPlan(dir, "# Site Brief\n\nThe hero is a hero film.\n", [], pages);
    assert.equal(film.videos.length, 1);
    assert.equal(film.videos[0]?.generateAudio, false);
    const slots = readFileSync(path.join(dir, ".hitchhiker", "assets", "slots.json"), "utf8");
    assert.match(slots, /hero-film/);
    assert.equal(slots.includes("TODO"), false);
  } finally {
    removeTempDir(dir);
  }
});
