import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSkillPacks, skillVersionMentions } from "../src/spec/skills.ts";

const NAMES = [
  "object-showcase",
  "scroll-choreography",
  "shader-recipes",
  "post-processing",
  "locked-versions",
  "awwwards-sotd-breakdowns",
];

test("every skill pack parses, triggers are set, and recipe versions match the lock", () => {
  const packs = loadSkillPacks();
  const names = packs.map((pack) => pack.name);
  for (const name of NAMES) assert.ok(names.includes(name), name);
  const locked = packs.find((pack) => pack.name === "locked-versions");
  assert.ok(locked);
  assert.ok(Object.keys(locked.versions).length >= 8);
  for (const pack of packs) {
    assert.ok(pack.siteTypes.length > 0, pack.name);
    assert.ok(pack.sectionKinds.length > 0, pack.name);
    assert.ok(pack.techniques.length > 0, pack.name);
    assert.notEqual(pack.motionAppetite, "", pack.name);
    assert.equal(pack.body.includes("!"), false, pack.name);
    assert.equal(/only use|do not use\s+\S+/i.test(pack.body), false, pack.name);
    for (const [lib, version] of Object.entries(pack.versions)) {
      assert.equal(locked.versions[lib], version, `${pack.name} pins ${lib}`);
    }
    for (const mention of skillVersionMentions(pack.body)) {
      assert.equal(locked.versions[mention.lib], mention.version, `${pack.name} mentions ${mention.lib}@${mention.version}`);
    }
  }
  const studies = packs.find((pack) => pack.name === "awwwards-sotd-breakdowns");
  assert.ok(studies);
  const links = studies.body.match(/https:\/\/www\.awwwards\.com\/sites\/[a-z0-9-]+/g) ?? [];
  assert.ok(links.length >= 8, `expected at least 8 site links, found ${links.length}`);
});
