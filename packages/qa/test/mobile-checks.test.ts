import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildDeviceMatrix, type DeviceDescriptor, type DeviceMap, type DeviceProject } from "../src/device-matrix.ts";
import { evaluateMobile, runMobileChecks, type MenuScript, type MobileDocument, type TargetBox, type TextSample } from "../src/mobile-checks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function descriptor(
  viewport: { width: number; height: number },
  browser: "chromium" | "webkit",
  touch: boolean,
): DeviceDescriptor {
  return {
    userAgent: `ua-${viewport.width}`,
    viewport,
    deviceScaleFactor: 2,
    isMobile: touch,
    hasTouch: touch,
    defaultBrowserType: browser,
  };
}

function fixtureMap(): DeviceMap {
  return {
    "iPhone 15": descriptor({ width: 393, height: 659 }, "webkit", true),
    "iPhone 15 landscape": descriptor({ width: 734, height: 343 }, "webkit", true),
    "Pixel 7": descriptor({ width: 412, height: 839 }, "chromium", true),
    "Pixel 7 landscape": descriptor({ width: 863, height: 360 }, "chromium", true),
    "iPad Pro 11": descriptor({ width: 834, height: 1194 }, "webkit", true),
    "iPad Pro 11 landscape": descriptor({ width: 1194, height: 834 }, "webkit", true),
    "Galaxy Tab S9": descriptor({ width: 640, height: 1024 }, "chromium", true),
    "Galaxy Tab S9 landscape": descriptor({ width: 1024, height: 640 }, "chromium", true),
    "Desktop Chrome": descriptor({ width: 1280, height: 720 }, "chromium", false),
  };
}

const PASS_CSS = `
.hero { min-height: 100vh; min-height: 100svh; }
.top {
  position: fixed;
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
.panel { position: sticky; padding-bottom: env(safe-area-inset-bottom); }
html { text-size-adjust: 100%; }
@media (hover: hover) and (pointer: fine) {
  .tip { display: none; }
  .tip:hover { display: block; }
  .brand { cursor: none; }
}
@media (pointer: coarse) {
  .tip { display: block; }
}
`;

const PASS_HTML = `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head><body>
<a class="skip" href="#content">Skip</a>
<header class="top">
<button aria-expanded="false" aria-controls="panel">Menu</button>
<nav><a href="/" aria-current="page">Home</a></nav>
</header>
<main id="content">
<div class="hero"><h1>Title</h1><a href="/start">Begin</a></div>
<video muted playsinline poster="/still.jpg"></video>
</main>
<div id="panel" inert><a href="/about">About</a></div>
</body></html>`;

const menu: MenuScript = {
  opened: true,
  closed: true,
  escapeClosed: true,
  focusTrapped: true,
  focusReturned: true,
  focusMovedIn: true,
  pageBehindHidden: true,
  ariaCurrent: true,
  skipLinkFirst: true,
  panelSafeArea: true,
  panelTargetMin: 48,
};

const targets: readonly TargetBox[] = [
  { name: "Menu", kind: "primary", width: 48, height: 48, spaced: true },
  { name: "Begin", kind: "primary", width: 44, height: 44, spaced: true },
  { name: "Home", kind: "inline", width: 30, height: 24, spaced: true },
];

const text: readonly TextSample[] = [375, 390, 430, 1440].map((width) => ({
  width,
  bodyPx: 18,
  lineHeight: 1.5,
  measureCh: 62,
}));

function passDoc(project: DeviceProject): MobileDocument {
  return {
    html: PASS_HTML,
    css: PASS_CSS,
    fullBleedHero: false,
    scrollWidth: project.context.viewport.width,
    clientWidth: project.context.viewport.width,
    targets,
    pointer: project.context.hasTouch ? "coarse" : "fine",
    emulatorMatchesPointer: true,
    menu,
    text,
    autoplayBlocked: false,
    saveData: false,
  };
}

test("mobile checks pass on every device project, including WebKit", () => {
  const projects = buildDeviceMatrix(fixtureMap());
  const report = runMobileChecks(projects, passDoc);
  assert.equal(report.ok, true, report.problems.join("\n"));
  const phone = report.reports.find((item) => item.projectId === "iphone-15");
  assert.ok(phone);
  assert.equal(phone.browser, "webkit");
  assert.equal(phone.pointerEvidence, "media-feature");
  const pixel = report.reports.find((item) => item.projectId === "pixel-7");
  assert.ok(pixel);
  assert.equal(pixel.interactiveWidget, "absent");
  assert.equal(report.reports.some((item) => item.browser === "webkit"), true);
});

test("a matrix with no WebKit project fails", () => {
  const projects = buildDeviceMatrix(fixtureMap()).filter((item) => item.browser !== "webkit");
  const report = runMobileChecks(projects, passDoc);
  assert.equal(report.ok, false);
  assert.match(report.problems.join("\n"), /WebKit/);
});

test("horizontal overflow, bare 100vh, and a short primary target fail", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(phone);
  const overflow = evaluateMobile(phone, { ...passDoc(phone), scrollWidth: 500, clientWidth: 393 });
  assert.match(overflow.problems.join("\n"), /overflow/);
  const bare = evaluateMobile(phone, {
    ...passDoc(phone),
    css: PASS_CSS.replace("min-height: 100svh;", ""),
  });
  assert.match(bare.problems.join("\n"), /100svh|100vh/);
  const small = evaluateMobile(phone, {
    ...passDoc(phone),
    targets: [{ name: "Menu", kind: "primary", width: 40, height: 40, spaced: true }],
  });
  assert.match(small.problems.join("\n"), /44/);
  assert.match(small.problems.join("\n"), /Menu/);
});

test("dvh is allowed only on a full-bleed hero, and safe area is the env inset", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(phone);
  const jump = evaluateMobile(phone, {
    ...passDoc(phone),
    css: `${PASS_CSS} .hero { min-height: 100dvh; }`,
    fullBleedHero: false,
  });
  assert.match(jump.problems.join("\n"), /dvh/);
  const bleed = evaluateMobile(phone, {
    ...passDoc(phone),
    css: `${PASS_CSS} .hero { min-height: 100dvh; }`,
    fullBleedHero: true,
  });
  assert.equal(bleed.ok, true, bleed.problems.join("\n"));
  const open = evaluateMobile(phone, {
    ...passDoc(phone),
    css: PASS_CSS.replaceAll("env(safe-area-inset-top)", "0px").replaceAll("env(safe-area-inset-right)", "0px").replaceAll("env(safe-area-inset-bottom)", "0px").replaceAll("env(safe-area-inset-left)", "0px"),
  });
  assert.match(open.problems.join("\n"), /safe-area/);
  assert.doesNotMatch(open.problems.join("\n"), /47/);
});

test("coarse pointers reject hover-only content and a custom cursor", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  const desk = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "desktop-1440");
  assert.ok(phone);
  assert.ok(desk);
  const css = `${PASS_CSS} .secret { display: none; } .secret:hover { display: block; } .brand { cursor: none; }`;
  const touch = evaluateMobile(phone, { ...passDoc(phone), css });
  assert.match(touch.problems.join("\n"), /hover/);
  assert.match(touch.problems.join("\n"), /cursor/);
  const fine = evaluateMobile(desk, { ...passDoc(desk), css, pointer: "fine" });
  assert.equal(fine.problems.some((line) => /custom cursor/i.test(line)), false);
});

test("a coarse emulator that misses the media feature records the CSS query", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(phone);
  const matched = evaluateMobile(phone, { ...passDoc(phone), emulatorMatchesPointer: false });
  assert.equal(matched.ok, true, matched.problems.join("\n"));
  assert.equal(matched.pointerEvidence, "css-query");
  const blind = evaluateMobile(phone, {
    ...passDoc(phone),
    emulatorMatchesPointer: false,
    css: ".hero { min-height: 100vh; min-height: 100svh; } .top { position: fixed; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); } html { text-size-adjust: 100%; }",
  });
  assert.match(blind.problems.join("\n"), /pointer/);
});

test("video keeps muted, playsinline, and a poster, and is not dropped on a phone", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(phone);
  const loud = evaluateMobile(phone, {
    ...passDoc(phone),
    html: PASS_HTML.replace("<video muted playsinline poster=\"/still.jpg\"></video>", "<video autoplay poster=\"/still.jpg\"></video>"),
  });
  assert.match(loud.problems.join("\n"), /muted/);
  assert.match(loud.problems.join("\n"), /playsinline/);
  const omitted = evaluateMobile(phone, {
    ...passDoc(phone),
    html: PASS_HTML.replace("<video muted playsinline poster=\"/still.jpg\"></video>", "<p data-video-omitted=\"phone\">Still</p>"),
  });
  assert.match(omitted.problems.join("\n"), /omitted/);
  const blocked = evaluateMobile(phone, {
    ...passDoc(phone),
    autoplayBlocked: true,
    html: PASS_HTML.replace("</video>", "</video><button data-video-control>Play</button>"),
  });
  assert.equal(blocked.ok, true, blocked.problems.join("\n"));
  assert.doesNotMatch(blocked.problems.join("\n"), /playing/);
  const stuck = evaluateMobile(phone, { ...passDoc(phone), autoplayBlocked: true });
  assert.match(stuck.problems.join("\n"), /control/);
});

test("the menu needs open, close, Escape, a focus trap, and focus return", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(phone);
  const shut = evaluateMobile(phone, {
    ...passDoc(phone),
    menu: { ...menu, escapeClosed: false, focusReturned: false },
  });
  assert.match(shut.problems.join("\n"), /Escape/);
  assert.match(shut.problems.join("\n"), /return/);
  const role = evaluateMobile(phone, {
    ...passDoc(phone),
    html: PASS_HTML.replace("<nav>", "<nav role=\"menu\">"),
  });
  assert.match(role.problems.join("\n"), /disclosure|role="menu"/);
});

test("body text is checked at 375, 390, 430, and 1440", () => {
  const phone = buildDeviceMatrix(fixtureMap()).find((item) => item.id === "iphone-15");
  assert.ok(phone);
  const short = evaluateMobile(phone, {
    ...passDoc(phone),
    text: text.map((sample) => (sample.width === 390 ? { ...sample, bodyPx: 14, lineHeight: 1.2, measureCh: 90 } : sample)),
  });
  assert.match(short.problems.join("\n"), /390/);
  assert.match(short.problems.join("\n"), /16/);
  const missing = evaluateMobile(phone, { ...passDoc(phone), text: text.filter((sample) => sample.width !== 430) });
  assert.match(missing.problems.join("\n"), /430/);
});

test("the checker does not treat playback or a 47px inset as the assertion", () => {
  const source = readFileSync(path.join(here, "..", "src", "mobile-checks.ts"), "utf8");
  assert.doesNotMatch(source, /reached playing|\.playing|video\.paused/);
  assert.doesNotMatch(source, /47px/);
});
