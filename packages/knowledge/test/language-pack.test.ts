import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLanguagePack, selectLanguageEntries } from "@hitchhiker/engine";

test("language pack entries parse from this package and stay optional", () => {
  const entries = loadLanguagePack();
  assert.ok(entries.length >= 11);
  const hero = selectLanguageEntries(
    { appetite: 9, sectionKind: "hero", artDirection: "3D product hero with glass, a camera move, and bloom." },
    entries,
  );
  assert.ok(hero.some((entry) => entry.name === "camera-path"));
  assert.ok(hero.some((entry) => entry.name === "glass-material"));
  assert.ok(hero.some((entry) => entry.name === "post-chain"));
  assert.equal(hero.some((entry) => entry.family === "shader"), false);
  const quiet = selectLanguageEntries(
    { appetite: 2, sectionKind: "hero", artDirection: "3D product hero with glass and a shader." },
    entries,
  );
  assert.equal(quiet.length, 0);
});
