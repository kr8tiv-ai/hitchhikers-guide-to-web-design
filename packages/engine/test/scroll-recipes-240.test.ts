import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSkillPacks } from "../src/spec/skills.ts";

const SNIPPETS = [
  'start: "top top"',
  'end: "+=150%"',
  "pin: true",
  "scrub: 1",
  "anticipatePin: 1",
  "invalidateOnRefresh: true",
  "xPercent: -100 * (panels.length - 1)",
  'ease: "none"',
  'end: () => "+=" + distance()',
  'type: "lines", mask: "lines"',
  "yPercent: 100",
  "duration: 1.2",
  'ease: "expo.out"',
  "stagger: 0.08",
  'lenis.on("scroll", ScrollTrigger.update)',
  "lenis.raf(time * 1000)",
  "gsap.ticker.lagSmoothing(0)",
  'snapTo: "labelsDirectional"',
  "min: 0.2",
  "max: 0.8",
  "delay: 0.1",
  "self.getVelocity()",
  "pinSpacing: false",
  "endTrigger:",
  "self.progress",
  "damp3(",
  "ScrollTrigger.refresh()",
  "gsap.matchMedia()",
  "ScrollTrigger.batch(",
  "lenis.scrollTo(target,",
  "offset:",
  "duration:",
  "easing:",
  "lerp:",
  "immediate:",
  "lock:",
  "force:",
  "onStart:",
  "onComplete:",
  "userData:",
  "anchors: true",
  "offset: -80",
  "duration: 1.2",
  "0.08-0.12",
  "offsetY:",
  "autoKill: true",
  '"max"',
  "ScrollTrigger.getById",
  "getScrollLookup",
  "gsap.utils.interpolate(current, target, 0.1)",
  "damp(",
];

test("scroll choreography ships the GSAP, Lenis, and Three recipes as working code", () => {
  const pack = loadSkillPacks().find((item) => item.name === "scroll-choreography");
  assert.ok(pack);
  for (const snippet of SNIPPETS) {
    assert.equal(pack.body.includes(snippet), true, snippet);
  }
  assert.equal(pack.body.includes("!"), false);
  assert.equal(/only use|do not use\s+\S+/i.test(pack.body), false);
  assert.match(pack.body, /https:\/\/gsap\.com\/docs\/v3\//);
  assert.match(pack.body, /https:\/\/github\.com\/darkroomengineering\/lenis/);
  assert.match(pack.body, /maath@0\.10\.8/);
  assert.match(pack.body, /three@0\.186\.1/);
});
