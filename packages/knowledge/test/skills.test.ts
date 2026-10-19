import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSkillPacks } from "@hitchhiker/engine";

test("skill packs live in this package and name their triggers", () => {
  const packs = loadSkillPacks();
  assert.ok(packs.length >= 6);
  for (const pack of packs) {
    assert.ok(pack.file.startsWith("packages/knowledge/skills/"), pack.file);
    assert.ok(pack.siteTypes.length > 0, pack.name);
    assert.ok(pack.sectionKinds.length > 0, pack.name);
    assert.ok(pack.techniques.length > 0, pack.name);
    assert.notEqual(pack.motionAppetite, "");
  }
});
