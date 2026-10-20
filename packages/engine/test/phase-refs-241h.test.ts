/**
 * Idea 22. A phase prompt loads the references that phase needs.
 * A WebGL pack in the copy phase fails. A motion pack in the sitemap
 * phase fails. The type phase does not include the Three pack.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPhaseReferences, phaseReferenceText, recordPhasePrompt } from "../src/spec/skills.ts";

test("the type phase leaves out the Three pack, and the WebGL phase loads it", () => {
  const typeLog = recordPhasePrompt("type");
  const webglLog = recordPhasePrompt("webgl");
  assert.equal(typeLog.phase, "type");
  assert.equal(typeLog.audit.ok, true, typeLog.audit.problems.join("\n"));
  assert.equal(typeLog.text.includes("@skill:three"), false);
  assert.equal(typeLog.text.includes("packs/three"), false);
  assert.match(typeLog.text, /@skill:typography/);
  assert.equal(webglLog.audit.ok, true, webglLog.audit.problems.join("\n"));
  assert.match(webglLog.text, /@skill:three/);
  assert.match(webglLog.text, /packages\/knowledge\/packs\/three\/SKILL\.md/);
});

test("a WebGL reference in the copy phase fails, and a motion reference in the sitemap phase fails", () => {
  const copy = auditPhaseReferences(
    "copy",
    "@skill:three\nRead on demand: packages/knowledge/packs/three/SKILL.md",
  );
  assert.equal(copy.ok, false);
  const copyNote = copy.problems.join("\n");
  assert.match(copyNote, /three/);
  assert.match(copyNote, /copy/);

  const sitemap = auditPhaseReferences(
    "sitemap",
    "@skill:motion\nRead on demand: packages/knowledge/packs/motion/SKILL.md",
  );
  assert.equal(sitemap.ok, false);
  const siteNote = sitemap.problems.join("\n");
  assert.match(siteNote, /motion/);
  assert.match(siteNote, /sitemap/);

  const copyOwn = auditPhaseReferences("copy", phaseReferenceText("copy"));
  assert.equal(copyOwn.ok, true, copyOwn.problems.join("\n"));
  const siteOwn = auditPhaseReferences("sitemap", phaseReferenceText("sitemap"));
  assert.equal(siteOwn.ok, true, siteOwn.problems.join("\n"));
});

test("motion and WebGL references stay in the phase that needs them", () => {
  const motionInWebgl = auditPhaseReferences("webgl", phaseReferenceText("motion"));
  assert.equal(motionInWebgl.ok, false);
  const webglInMotion = auditPhaseReferences("motion", phaseReferenceText("webgl"));
  assert.equal(webglInMotion.ok, false);
  assert.equal(auditPhaseReferences("motion", phaseReferenceText("motion")).ok, true);
  assert.equal(auditPhaseReferences("webgl", phaseReferenceText("webgl")).ok, true);
  const scrollInSitemap = auditPhaseReferences("sitemap", "@skill:scroll-choreography");
  assert.equal(scrollInSitemap.ok, false);
  assert.match(scrollInSitemap.problems.join("\n"), /scroll-choreography/);
});
