/**
 * Rebuild the README hero from the nebula master.
 *
 * Masters stay outside the repo:
 *   C:\Users\lucid\Desktop\hh-pending-241\assets\hh-nebula-loop.mp4
 *   C:\Users\lucid\Desktop\hh-pending-241\assets\hh-cosmos-loop.mp4
 *     (probed, not used: same 1280x720 24fps 241-frame loop, brighter core)
 *
 * Probe (ffprobe, 2026-10-21), both files:
 *   h264 High, yuv420p, bt709, 1280x720, 24 fps, 241 frames, 10.041667 s, aac.
 *   nebula ~8.8 MB. cosmos ~16.5 MB.
 *   The seam is visible (first-vs-last SSIM about 0.83), so the loop is
 *   crossfaded 12 frames (0.5 s) before the plate goes on.
 *
 * Writes:
 *   docs/assets/hero.gif   1280x426, 15 fps, 30 frames, loop forever
 *   docs/assets/hero.png   2560x852 still (2x of that frame)
 *   .github/social-preview.png   1280x640
 * Shots (outside the repo):
 *   C:\Users\lucid\Desktop\hh-pending-241\242f-shots\
 *
 * Usage:
 *   node scripts/build-readme-hero.mjs --still-only
 *   node scripts/build-readme-hero.mjs --samples
 *   node scripts/build-readme-hero.mjs
 *
 * Every ffmpeg command this script runs is the args array in `run(...)`.
 * The dither that won the sample pass is CHOSEN below.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../packages/qa/package.json", import.meta.url));
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const master = "C:\\Users\\lucid\\Desktop\\hh-pending-241\\assets\\hh-nebula-loop.mp4";
const shotsDir = "C:\\Users\\lucid\\Desktop\\hh-pending-241\\242f-shots";
const tmp = path.join(process.env.TEMP ?? path.join(repo, "tmp"), "hh-hero-242f");

const OUT_W = 1440;
const OUT_H = 480;
const GIF_FPS = 18;
const SRC_FPS = 24;
const FADE_FRAMES = 12;
const SCALE = OUT_W / 1280;
const ORBIT_BOX = 360;
const ORBIT_CX = 1110 * SCALE;
const ORBIT_CY = 74 * (OUT_H / 420);
const ORBIT_X = Math.round(ORBIT_CX - ORBIT_BOX / 2);
const ORBIT_Y = Math.round(ORBIT_CY - ORBIT_BOX / 2);

/**
 * Sample pass (36 frames from the rich middle of the loop, viewed by eye):
 *   per-frame sierra2_4a   palette follows the nebula's hue shift
 *   diff sierra2_4a        one palette, the teal falloff breaks into steps
 *   full sierra2_4a        same steps, stars a bit muddier
 *   diff bayer scale 3     ordered crosshatch across the wash
 *   diff bayer scale 2     tighter crosshatch, still a pattern
 *   protect, dither none   type stays flat, the bands come back
 * Bayer was larger, not smaller. On the full 9.5s plate, 1280-wide at 15 fps:
 *   diff sierra 44 MB, dither none 38 MB, blur plus 160 colors 36 MB.
 * The motion is the byte cost, so the shipped file is a 2.0 s excerpt of the
 * rich middle, crossfaded 6 frames, per-frame sierra2_4a, diff_mode=rectangle.
 */
const CHOSEN = "perframe-sierra";

const fontDir = path.join(repo, "packages", "app", "public", "fonts");

function fontUrl(name) {
  const bytes = readFileSync(path.join(fontDir, name));
  return `data:font/woff2;base64,${bytes.toString("base64")}`;
}

function pathToFileUrl(file) {
  return "file:///" + file.replaceAll("\\", "/");
}

function run(args, label) {
  const pretty = ["ffmpeg", ...args].join(" ");
  process.stdout.write(`\n# ${label}\n${pretty}\n`);
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const tail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.slice(-5000);
    throw new Error(`${label} failed (${result.status}): ${tail}`);
  }
}

function probe(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,nb_frames,r_frame_rate,duration",
      "-of", "json",
      file,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}: ${result.stderr}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  if (stream === undefined) throw new Error(`ffprobe returned no video stream for ${file}`);
  return stream;
}

const faces = `
@font-face {
  font-family: "Bricolage Grotesque";
  font-style: normal;
  font-weight: 800;
  src: url("${fontUrl("BricolageGrotesque-opsz96-wght800.woff2")}") format("woff2");
}
@font-face {
  font-family: "Bricolage Grotesque";
  font-style: normal;
  font-weight: 600;
  src: url("${fontUrl("BricolageGrotesque-opsz16-wght600.woff2")}") format("woff2");
}
@font-face {
  font-family: "Literata";
  font-style: italic;
  font-weight: 400;
  src: url("${fontUrl("Literata-Italic-opsz16-wght400.woff2")}") format("woff2");
}
`;

function gridSvg(width, height, stepX, stepY) {
  const lines = [];
  for (let x = stepX; x < width; x += stepX) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`);
  }
  for (let y = stepY; y < height; y += stepY) {
    lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`);
  }
  return `<svg class="grid" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines.join("")}</svg>`;
}

function orbitSvg(box) {
  const s = SCALE;
  const c = box / 2;
  return `<svg class="orbit" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true">
    <g transform="translate(${c} ${c})">
      <ellipse cx="0" cy="0" rx="${(104 * s).toFixed(2)}" ry="${(36 * s).toFixed(2)}" transform="rotate(-18)" fill="none" stroke="#F2EBDD" stroke-opacity="0.55" stroke-width="1.6" stroke-dasharray="3.4 7.9"/>
      <ellipse cx="0" cy="0" rx="${(62 * s).toFixed(2)}" ry="${(22 * s).toFixed(2)}" transform="rotate(-18)" fill="none" stroke="#F2EBDD" stroke-opacity="0.38" stroke-width="1.4"/>
      <circle cx="0" cy="0" r="${(17 * s).toFixed(2)}" fill="#FF5A1F"/>
      <circle cx="${(90 * s).toFixed(2)}" cy="${(-38 * s).toFixed(2)}" r="${(6 * s).toFixed(2)}" fill="#F2EBDD"/>
    </g>
  </svg>`;
}

function plateCss(width, height) {
  return `
    html, body { margin: 0; width: ${width}px; height: ${height}px; background: transparent; }
    body {
      position: relative;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    .wash {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(18,17,16,0.42) 0%, rgba(18,17,16,0.08) 42%, rgba(18,17,16,0.50) 100%),
        linear-gradient(90deg, rgba(18,17,16,0.74) 0%, rgba(18,17,16,0.58) 46%, rgba(18,17,16,0.40) 100%);
    }
    .grid {
      position: absolute;
      inset: 0;
      stroke: #F2EBDD;
      stroke-opacity: 0.16;
      stroke-width: 1;
      shape-rendering: crispEdges;
    }
    .copy { position: absolute; inset: 0; }
    .eyebrow, h1, .footer, .num {
      font-family: "Bricolage Grotesque", sans-serif;
      margin: 0;
      color: #F2EBDD;
    }
    .eyebrow {
      position: absolute;
      left: 80px;
      top: 52px;
      font-weight: 600;
      font-size: 16px;
      letter-spacing: 0.06em;
      line-height: 1;
      text-transform: uppercase;
      opacity: 0.78;
    }
    h1 {
      position: absolute;
      left: 74px;
      top: 148px;
      font-weight: 800;
      font-size: 132px;
      line-height: 0.84;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
      text-shadow: 0 0 0.02em #121110;
    }
    .rule-row {
      position: absolute;
      left: 80px;
      top: 292px;
      display: flex;
      align-items: center;
      gap: 22px;
    }
    .rule { width: 108px; height: 8px; background: #FF5A1F; flex: none; }
    .tag {
      margin: 0;
      color: #F2EBDD;
      font-family: "Literata", serif;
      font-style: italic;
      font-weight: 400;
      font-size: 26px;
      line-height: 1.35;
      letter-spacing: 0;
      opacity: 0.92;
    }
    .footer {
      position: absolute;
      left: 80px;
      bottom: 32px;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.06em;
      line-height: 1;
      text-transform: uppercase;
      opacity: 0.72;
    }
    .num {
      position: absolute;
      right: 36px;
      bottom: 28px;
      color: #FF5A1F;
      font-weight: 600;
      font-size: 18px;
      letter-spacing: 0.06em;
      line-height: 1;
    }
    .orbit { position: absolute; left: ${ORBIT_X}px; top: ${ORBIT_Y}px; }
  `;
}

function heroHtml(layer) {
  const showWash = layer === "wash" || layer === "all";
  const showInk = layer === "ink" || layer === "all";
  const showOrbit = layer === "orbit" || layer === "all";
  const orbitStyle = layer === "orbit"
    ? `.orbit { position: absolute; left: 0; top: 0; }`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${faces}
${plateCss(OUT_W, OUT_H)}
${orbitStyle}
</style>
</head>
<body>
  ${showWash ? `<div class="wash"></div>${gridSvg(OUT_W, OUT_H, 180, 120)}` : ""}
  ${showInk ? `<div class="copy">
    <p class="eyebrow">THE HITCHHIKER\u2019S GUIDE TO WEB DESIGN</p>
    <h1>DON\u2019T PANIC</h1>
    <div class="rule-row"><span class="rule"></span><p class="tag">Simple questions in. Award-calibre websites out.</p></div>
    <p class="footer">FREE \u00b7 MIT \u00b7 SPEC-DRIVEN \u00b7 RUNS LOCALLY IN GROK BUILD</p>
    <p class="num">42</p>
  </div>` : ""}
  ${showOrbit ? orbitSvg(ORBIT_BOX) : ""}
</body>
</html>`;
}

function socialHtml() {
  const w = 1280;
  const h = 640;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${faces}
html, body { margin: 0; width: ${w}px; height: ${h}px; background: transparent; }
body { position: relative; overflow: hidden; -webkit-font-smoothing: antialiased; text-rendering: geometricPrecision; }
.wash {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(18,17,16,0.38), rgba(18,17,16,0.10) 46%, rgba(18,17,16,0.55)),
    linear-gradient(90deg, rgba(18,17,16,0.70) 0%, rgba(18,17,16,0.50) 55%, rgba(18,17,16,0.36) 100%);
}
.grid { position: absolute; inset: 0; stroke: #F2EBDD; stroke-opacity: 0.16; stroke-width: 1; shape-rendering: crispEdges; }
.safe { position: absolute; left: 120px; top: 60px; width: 1040px; height: 520px; }
.eyebrow, h1, .num { font-family: "Bricolage Grotesque", sans-serif; margin: 0; color: #F2EBDD; }
.eyebrow {
  position: absolute; left: 8px; top: 28px;
  font-weight: 600; font-size: 15px; letter-spacing: 0.06em; line-height: 1;
  text-transform: uppercase; opacity: 0.78;
}
h1 {
  position: absolute; left: 0; top: 132px;
  font-weight: 800; font-size: 86px; line-height: 0.84; letter-spacing: 0.04em;
  text-transform: uppercase; white-space: nowrap;
  text-shadow: 0 0 0.02em #121110;
}
.rule-row { position: absolute; left: 6px; top: 268px; display: flex; align-items: center; gap: 18px; }
.rule { width: 96px; height: 8px; background: #FF5A1F; flex: none; }
.tag {
  margin: 0; color: #F2EBDD;
  font-family: "Literata", serif; font-style: italic; font-weight: 400;
  font-size: 26px; line-height: 1.35; letter-spacing: 0;
}
.num {
  position: absolute; right: 8px; bottom: 22px;
  color: #FF5A1F; font-weight: 600; font-size: 20px; letter-spacing: 0.06em;
}
.orbit { position: absolute; right: 4px; top: -28px; }
</style>
</head>
<body>
  <div class="wash"></div>
  ${gridSvg(w, h, 160, 128)}
  <div class="safe">
    <p class="eyebrow">THE HITCHHIKER\u2019S GUIDE TO WEB DESIGN</p>
    <h1>DON\u2019T PANIC</h1>
    <div class="rule-row"><span class="rule"></span><p class="tag">Simple questions in. Award-calibre websites out.</p></div>
    <p class="num">42</p>
    ${orbitSvg(300).replace('class="orbit"', 'class="orbit"')}
  </div>
</body>
</html>`;
}

async function shoot(browser, html, file, width, height, fitTitle) {
  const htmlPath = file.replace(/\.png$/, ".html");
  writeFileSync(htmlPath, html, "utf8");
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileUrl(htmlPath));
  const titleSize = await page.evaluate(async (shouldFit) => {
    await document.fonts.ready;
    const h1 = document.querySelector("h1");
    if (h1 !== null) {
      const pending = [...document.fonts].filter((face) => face.status !== "loaded");
      if (pending.length > 0) {
        throw new Error(pending.map((face) => `${face.family} ${face.weight} ${face.style} ${face.status}`).join(", "));
      }
    }
    if (!shouldFit || h1 === null) return 0;
    const max = 1000;
    let size = 150;
    h1.style.fontSize = `${size}px`;
    while (h1.getBoundingClientRect().width > max && size > 72) {
      size -= 1;
      h1.style.fontSize = `${size}px`;
    }
    return size;
  }, fitTitle);
  await page.screenshot({ path: file, omitBackground: true, type: "png" });
  await page.close();
  process.stdout.write(`shot ${path.basename(file)} title ${titleSize}px\n`);
  return titleSize;
}

function downscale(src, dest, width, height) {
  run(
    ["-y", "-i", src, "-vf", `scale=${width}:${height}:flags=lanczos`, "-pix_fmt", "rgba", dest],
    `downscale ${path.basename(dest)}`,
  );
}

function crossfadeFilter(frames) {
  const bodyFrames = frames - FADE_FRAMES;
  const fadeSeconds = (FADE_FRAMES / SRC_FPS).toFixed(6);
  const offset = (bodyFrames / SRC_FPS - FADE_FRAMES / SRC_FPS).toFixed(6);
  const duration = (bodyFrames / SRC_FPS).toFixed(6);
  const chain = [
    `[0:v]fps=${SRC_FPS},format=rgba,setsar=1,split[headSrc][bodySrc]`,
    `[headSrc]trim=start_frame=0:end_frame=${FADE_FRAMES},setpts=PTS-STARTPTS[head]`,
    `[bodySrc]trim=start_frame=${FADE_FRAMES},setpts=PTS-STARTPTS[body]`,
    `[body][head]xfade=transition=fade:duration=${fadeSeconds}:offset=${offset},format=rgba[xf]`,
    `[xf]scale=${OUT_W}:${Math.round(720 * SCALE)}:flags=lanczos,crop=${OUT_W}:${OUT_H}:0:${Math.round((720 * SCALE - OUT_H) / 2)},fps=${GIF_FPS},setsar=1,format=rgba[vid]`,
  ].join(";");
  return { chain, duration, offset, fadeSeconds };
}

function orbitChain(duration) {
  return [
    `[2:v]format=rgba,loop=loop=-1:size=1:start=0,trim=duration=${duration},setpts=PTS-STARTPTS`,
    `rotate=a='0.10*sin(2*PI*t/${duration})':ow=iw:oh=ih:fillcolor=none[orb]`,
  ].join(",");
}

function buildMezzanine(info, withInk, dest) {
  const { chain, duration } = crossfadeFilter(Number(info.nb_frames));
  const parts = [
    chain,
    `[1:v]format=rgba[wash]`,
    `[vid][wash]overlay=0:0:format=auto:shortest=1[bg]`,
    orbitChain(duration),
    `[bg][orb]overlay=${ORBIT_X}:${ORBIT_Y}:format=auto:shortest=1[withorb]`,
  ];
  const inputs = [
    "-y", "-i", master,
    "-loop", "1", "-i", path.join(tmp, "wash.png"),
    "-i", path.join(tmp, "orbit.png"),
  ];
  let map = "[withorb]";
  if (withInk) {
    parts.push(`[3:v]format=rgba[ink]`, `[withorb][ink]overlay=0:0:format=auto:shortest=1[out]`);
    inputs.push("-loop", "1", "-i", path.join(tmp, "ink.png"));
    map = "[out]";
  }
  const frameCount = Math.round(Number(duration) * GIF_FPS);
  run(
    [
      ...inputs,
      "-filter_complex", parts.join(";"),
      "-map", map,
      "-an",
      "-frames:v", String(frameCount),
      "-c:v", "libx264rgb",
      "-crf", "12",
      "-preset", "veryfast",
      "-pix_fmt", "rgb24",
      dest,
    ],
    `mezzanine ${path.basename(dest)}`,
  );
  return duration;
}

function paletteGif(input, dest, mode, start, frames) {
  const seek = start === undefined ? ["-i", input] : ["-ss", start, "-i", input];
  const limit = frames === undefined ? [] : ["-frames:v", String(frames)];
  const graph = {
    "perframe-sierra": "[0:v]split[a][b];[a]palettegen=stats_mode=single:reserve_transparent=0[p];[b][p]paletteuse=new=1:dither=sierra2_4a:diff_mode=rectangle",
    "diff-sierra": "[0:v]split[a][b];[a]palettegen=stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
    "full-sierra": "[0:v]split[a][b];[a]palettegen=stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle",
    "diff-bayer3": "[0:v]split[a][b];[a]palettegen=stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
    "diff-bayer2": "[0:v]split[a][b];[a]palettegen=stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=bayer:bayer_scale=2:diff_mode=rectangle",
  }[mode];
  if (graph === undefined) throw new Error(`unknown gif mode ${mode}`);
  run(
    ["-y", ...seek, "-filter_complex", graph, ...limit, "-loop", "0", dest],
    `gif ${mode} ${path.basename(dest)}`,
  );
}

function protectGif(bgFile, ink, dest, start, frames) {
  const seek = start === undefined ? ["-i", bgFile] : ["-ss", start, "-i", bgFile];
  const limit = frames === undefined ? [] : ["-frames:v", String(frames)];
  const dithered = path.join(tmp, `dithered-${path.basename(dest)}.mkv`);
  run(
    [
      "-y", ...seek,
      "-filter_complex",
      "[0:v]split[a][b];[a]palettegen=stats_mode=diff:reserve_transparent=0[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle,format=rgb24[d]",
      "-map", "[d]",
      ...limit,
      "-c:v", "libx264rgb", "-crf", "0", "-preset", "veryfast",
      dithered,
    ],
    "protect dither pass",
  );
  run(
    [
      "-y", "-i", dithered, "-loop", "1", "-i", ink,
      "-filter_complex",
      "[0:v][1:v]overlay=0:0:format=auto:shortest=1,split[a][b];[a]palettegen=stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
      "-loop", "0",
      dest,
    ],
    "protect ink pass",
  );
}

function stillPng(info) {
  const frames = Number(info.nb_frames);
  const duration = (frames - FADE_FRAMES) / SRC_FPS;
  const angle = (0.1 * Math.sin((2 * Math.PI * 4.5) / duration)).toFixed(6);
  const w = OUT_W * 2;
  const h = OUT_H * 2;
  const scaledH = Math.round(720 * SCALE * 2);
  const cropY = Math.round((scaledH - h) / 2);
  const chain = [
    `[0:v]scale=${w}:${scaledH}:flags=lanczos,crop=${w}:${h}:0:${cropY},setsar=1,format=rgba[vid]`,
    `[1:v]format=rgba[wash]`,
    `[vid][wash]overlay=0:0:format=auto[bg]`,
    `[2:v]format=rgba,rotate=a=${angle}:ow=iw:oh=ih:fillcolor=none[orb]`,
    `[bg][orb]overlay=${ORBIT_X * 2}:${ORBIT_Y * 2}:format=auto[withorb]`,
    `[3:v]format=rgba[ink]`,
    `[withorb][ink]overlay=0:0:format=auto[out]`,
  ].join(";");
  const full = path.join(tmp, "still-full.png");
  const dest = path.join(repo, "docs", "assets", "hero.png");
  run(
    [
      "-y",
      "-ss", "5",
      "-i", master,
      "-i", path.join(tmp, "wash-2x.png"),
      "-i", path.join(tmp, "orbit-2x.png"),
      "-i", path.join(tmp, "ink-2x.png"),
      "-filter_complex", chain,
      "-map", "[out]",
      "-frames:v", "1",
      "-update", "1",
      full,
    ],
    "still png 2x plate",
  );
  run(
    ["-y", "-i", full, "-vf", "scale=2560:852:flags=lanczos", "-update", "1", "-compression_level", "100", "-pred", "mixed", dest],
    "still png match gif 2x",
  );
  return dest;
}

function shipGif(platePath, dest) {
  run(
    [
      "-y", "-ss", "3.6", "-t", "2.45", "-i", platePath,
      "-filter_complex",
      "[0:v]fps=15,scale=1280:-2:flags=lanczos,setsar=1,format=rgb24,split[headSrc][bodySrc];[headSrc]trim=start_frame=0:end_frame=6,setpts=PTS-STARTPTS[head];[bodySrc]trim=start_frame=6,setpts=PTS-STARTPTS[body];[body][head]xfade=transition=fade:duration=0.4:offset=1.6,format=rgb24,split[a][b];[a]palettegen=stats_mode=single:reserve_transparent=0[p];[b][p]paletteuse=new=1:dither=sierra2_4a:diff_mode=rectangle",
      "-loop", "0",
      dest,
    ],
    "ship gif perframe-sierra",
  );
}

function socialPng() {
  const dest = path.join(repo, ".github", "social-preview.png");
  const copy = path.join(shotsDir, "social-preview-1280x640.png");
  run(
    [
      "-y",
      "-ss", "5",
      "-i", master,
      "-i", path.join(tmp, "social-2x.png"),
      "-filter_complex",
      "[0:v]scale=1280:720:flags=lanczos,crop=1280:640:0:40,format=rgba[vid];[1:v]scale=1280:640:flags=lanczos,format=rgba[plate];[vid][plate]overlay=0:0:format=auto[out]",
      "-map", "[out]",
      "-frames:v", "1",
      "-update", "1",
      "-compression_level", "100",
      "-pred", "mixed",
      dest,
    ],
    "social preview",
  );
  copyFileSync(dest, copy);
  return dest;
}

const mode = process.argv[2] ?? "--full";

mkdirSync(tmp, { recursive: true });
mkdirSync(shotsDir, { recursive: true });
mkdirSync(path.join(repo, ".github"), { recursive: true });

if (mode === "--from-plate") {
  const plateReady = path.join(tmp, "plate.mp4");
  const gif = path.join(repo, "docs", "assets", "hero.gif");
  shipGif(plateReady, gif);
  const gifInfo = probe(gif);
  process.stdout.write(`gif ${gifInfo.width}x${gifInfo.height} frames ${gifInfo.nb_frames} fps ${gifInfo.r_frame_rate} bytes ${statSync(gif).size} dither ${CHOSEN}\n`);
  process.exit(0);
}

const info = probe(master);
process.stdout.write(`master ${info.width}x${info.height} frames ${info.nb_frames} fps ${info.r_frame_rate} duration ${info.duration}\n`);
if (Number(info.width) !== 1280 || Number(info.height) !== 720) {
  throw new Error(`expected 1280x720, got ${info.width}x${info.height}`);
}

const browser = await chromium.launch({
  args: ["--font-render-hinting=none", "--disable-lcd-text"],
});
await shoot(browser, heroHtml("wash"), path.join(tmp, "wash-2x.png"), OUT_W, OUT_H, false);
await shoot(browser, heroHtml("ink"), path.join(tmp, "ink-2x.png"), OUT_W, OUT_H, true);
await shoot(browser, heroHtml("orbit"), path.join(tmp, "orbit-2x.png"), ORBIT_BOX, ORBIT_BOX, false);
await shoot(browser, socialHtml(), path.join(tmp, "social-2x.png"), 1280, 640, false);
await browser.close();

downscale(path.join(tmp, "wash-2x.png"), path.join(tmp, "wash.png"), OUT_W, OUT_H);
downscale(path.join(tmp, "ink-2x.png"), path.join(tmp, "ink.png"), OUT_W, OUT_H);
downscale(path.join(tmp, "orbit-2x.png"), path.join(tmp, "orbit.png"), ORBIT_BOX, ORBIT_BOX);

const plate = path.join(tmp, "plate.mp4");
const bg = path.join(tmp, "bg.mp4");

if (mode === "--still-only") {
  const still = stillPng(info);
  const social = socialPng();
  process.stdout.write(`still ${still}\nsocial ${social}\n`);
  process.exit(0);
}

buildMezzanine(info, true, plate);

if (mode === "--samples") {
  buildMezzanine(info, false, bg);
  const sampleDir = path.join(tmp, "samples");
  mkdirSync(sampleDir, { recursive: true });
  const modes = ["perframe-sierra", "diff-sierra", "full-sierra", "diff-bayer3", "diff-bayer2"];
  for (const name of modes) {
    paletteGif(plate, path.join(sampleDir, `${name}.gif`), name, "3.2", 36);
    run(
      ["-y", "-i", path.join(sampleDir, `${name}.gif`), "-vf", "select=eq(n\\,18)", "-frames:v", "1", "-update", "1", path.join(sampleDir, `${name}.png`)],
      `sample frame ${name}`,
    );
  }
  protectGif(bg, path.join(tmp, "ink.png"), path.join(sampleDir, "protect.gif"), "3.2", 36);
  run(
    ["-y", "-i", path.join(sampleDir, "protect.gif"), "-vf", "select=eq(n\\,18)", "-frames:v", "1", "-update", "1", path.join(sampleDir, "protect.png")],
    "sample frame protect",
  );
  run(
    ["-y", "-ss", "4.2", "-i", plate, "-frames:v", "1", "-update", "1", path.join(sampleDir, "plate.png")],
    "sample plate",
  );
  process.stdout.write(`samples in ${sampleDir}\n`);
  process.exit(0);
}

const gif = path.join(repo, "docs", "assets", "hero.gif");
shipGif(plate, gif);
const gifInfo = probe(gif);
const gifBytes = statSync(gif).size;
process.stdout.write(`gif ${gifInfo.width}x${gifInfo.height} frames ${gifInfo.nb_frames} fps ${gifInfo.r_frame_rate} bytes ${gifBytes} dither ${CHOSEN}\n`);

const still = stillPng(info);
socialPng();
process.stdout.write(`still ${still} ${statSync(still).size} bytes\n`);

const frameDir = path.join(shotsDir, "frames");
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });
const mid = Math.max(1, Math.floor(Number(gifInfo.nb_frames) / 2));
const late = Math.max(2, Math.floor((Number(gifInfo.nb_frames) * 3) / 4));
const picks = [0, Math.floor(Number(gifInfo.nb_frames) / 4), mid, late];
for (const n of picks) {
  run(
    ["-y", "-i", gif, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", "-update", "1", path.join(frameDir, `frame-${String(n).padStart(3, "0")}.png`)],
    `extract gif frame ${n}`,
  );
}
copyFileSync(still, path.join(shotsDir, "hero.png"));
copyFileSync(gif, path.join(shotsDir, "hero.gif"));
process.stdout.write(`shots ${shotsDir}\n`);
