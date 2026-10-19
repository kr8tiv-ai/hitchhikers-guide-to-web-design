import assert from "node:assert/strict";
import { test } from "node:test";
import { expandSkillIncludes, loadSkillPacks, selectSkillPacks } from "@hitchhiker/engine";

test("activation keeps untriggered packs out and reports an unknown name", () => {
  const packs = loadSkillPacks();
  const hero = selectSkillPacks(
    { siteType: "product", motionAppetite: 9, sectionKind: "hero", artDirection: "3D glass product camera bloom" },
    packs,
  ).map((pack) => pack.name);
  assert.ok(hero.includes("object-showcase"));
  assert.equal(hero.includes("scroll-choreography"), false);
  const expanded = expandSkillIncludes("@skill:no-such-skill", packs, 100);
  assert.deepEqual(expanded.unknown, ["no-such-skill"]);
  assert.match(expanded.text, /Unknown skill: no-such-skill/);
  assert.equal(expanded.inlined.length, 0);
});
