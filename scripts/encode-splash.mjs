/**
 * Rebuild the DON'T PANIC splash loops from the Grok Imagine masters.
 *
 * Masters stay outside the repo:
 *   C:\Users\lucid\Desktop\hh-pending-241\assets\hh-cosmos-loop.mp4
 *   C:\Users\lucid\Desktop\hh-pending-241\assets\hh-nebula-loop.mp4
 * This script writes only the optimized files under packages/app/public/splash/.
 *
 * Probe (ffprobe, both files, 2026-10-21):
 *   h264 High, yuv420p, bt709, 1280x720, 24 fps, 241 frames, 10.041667 s, aac.
 *   cosmos ~16.5 MB, nebula ~8.8 MB.
 *   First-vs-last SSIM: cosmos All 0.810, nebula All 0.830. Both seams are visible,
 *   so each loop is crossfaded (12 frames, 0.5 s) before encode.
 *
 * Top tier is 720. The masters are generated 720p footage. A lanczos scale to
 * 1080 cannot invent star-field detail and only adds bytes. The Three.js layer
 * is what stays crisp at device pixels. Phone and desktop share these 720 files.
 * The page still picks a <source> with media and type. Both media queries point
 * at the same 720 encode.
 *
 * Phone budget: the 720 AV1 WebM for each loop stays under about 1.5 MB.
 * H.264 MP4 is the Safari fallback. Posters are a strong frame at t=5s
 * (cosmos white dwarf, nebula dark core), AVIF plus WebP.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const masters = path.resolve("C:\\Users\\lucid\\Desktop\\hh-pending-241\\assets");
const outDir = path.join(repo, "packages", "app", "public", "splash");
const tmpDir = path.join(process.env.TEMP ?? path.join(repo, "tmp"), "hh-splash-encode");

const LOOPS = [
  { id: "cosmos", master: path.join(masters, "hh-cosmos-loop.mp4") },
  { id: "nebula", master: path.join(masters, "hh-nebula-loop.mp4") },
];

const AV1_BUDGET = Math.round(1.5 * 1024 * 1024);
const FADE_FRAMES = 12;
const FPS = 24;

function run(args, label) {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const tail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.slice(-4000);
    throw new Error(`${label} failed (${result.status}): ${tail}`);
  }
}

function probe(file) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames,r_frame_rate,duration", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`ffprobe failed for ${file}: ${result.stderr}`);
  const stream = JSON.parse(result.stdout).streams?.[0];
  if (stream === undefined) throw new Error(`ffprobe returned no video stream for ${file}`);
  return stream;
}

function crossfade(master, seamless) {
  const info = probe(master);
  const width = Number(info.width);
  const height = Number(info.height);
  const frames = Number(info.nb_frames);
  if (width !== 1280 || height !== 720) {
    throw new Error(`${master} is ${width}x${height}. This script ships 720 as the top tier and will not upscale.`);
  }
  if (!Number.isFinite(frames) || frames <= FADE_FRAMES + 2) {
    throw new Error(`${master} has ${info.nb_frames} frames. Need a real frame count before the crossfade.`);
  }
  const bodyFrames = frames - FADE_FRAMES;
  const fadeSeconds = FADE_FRAMES / FPS;
  const offset = (bodyFrames / FPS - fadeSeconds).toFixed(6);
  const filter = [
    `[0:v]fps=${FPS},format=yuv420p,setsar=1,split[headSrc][bodySrc]`,
    `[headSrc]trim=start_frame=0:end_frame=${FADE_FRAMES},setpts=PTS-STARTPTS[head]`,
    `[bodySrc]trim=start_frame=${FADE_FRAMES},setpts=PTS-STARTPTS[body]`,
    `[body][head]xfade=transition=fade:duration=${fadeSeconds}:offset=${offset},format=yuv420p,fps=${FPS}[v]`,
  ].join(";");
  run(
    ["-y", "-i", master, "-an", "-filter_complex", filter, "-map", "[v]", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p", seamless],
    `crossfade ${path.basename(master)}`,
  );
  return { width, height, frames, offset };
}

function encodeAv1(seamless, dest) {
  const crfs = [48, 50, 51, 52, 54];
  let chosen = 0;
  for (const crf of crfs) {
    run(
      [
        "-y", "-i", seamless, "-an",
        "-c:v", "libsvtav1", "-crf", String(crf), "-preset", "6", "-pix_fmt", "yuv420p",
        "-svtav1-params", "tune=0:fast-decode=1",
        dest,
      ],
      `av1 crf ${crf} ${path.basename(dest)}`,
    );
    chosen = crf;
    const bytes = statSync(dest).size;
    process.stdout.write(`av1 ${path.basename(dest)} crf ${crf} ${bytes} bytes\n`);
    if (bytes <= AV1_BUDGET) return { crf, bytes };
  }
  const bytes = statSync(dest).size;
  if (bytes > AV1_BUDGET) {
    throw new Error(`${dest} is ${bytes} bytes after CRF ${chosen}. Budget is ${AV1_BUDGET}.`);
  }
  return { crf: chosen, bytes };
}

function encodeH264(seamless, dest) {
  let bytes = 0;
  for (const crf of [28, 31, 34]) {
    run(
      [
        "-y", "-i", seamless, "-an",
        "-c:v", "libx264", "-crf", String(crf), "-preset", "slow", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        dest,
      ],
      `h264 crf ${crf} ${path.basename(dest)}`,
    );
    bytes = statSync(dest).size;
    process.stdout.write(`h264 ${path.basename(dest)} crf ${crf} ${bytes} bytes\n`);
    if (bytes <= 2.5 * 1024 * 1024) return bytes;
  }
  return bytes;
}

function posters(master, id) {
  const avif = path.join(outDir, `${id}-poster.avif`);
  const webp = path.join(outDir, `${id}-poster.webp`);
  run(
    ["-y", "-ss", "5", "-i", master, "-frames:v", "1", "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "28", "-cpu-used", "6", "-pix_fmt", "yuv420p", avif],
    `avif poster ${id}`,
  );
  run(
    ["-y", "-ss", "5", "-i", master, "-frames:v", "1", "-c:v", "libwebp", "-quality", "76", "-compression_level", "6", webp],
    `webp poster ${id}`,
  );
  process.stdout.write(`poster ${id} avif ${statSync(avif).size} webp ${statSync(webp).size}\n`);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const notes = [];
for (const loop of LOOPS) {
  const info = probe(loop.master);
  notes.push(`${loop.id} master ${info.width}x${info.height} frames ${info.nb_frames} duration ${info.duration}`);
  const seamless = path.join(tmpDir, `${loop.id}-seamless.mp4`);
  const fade = crossfade(loop.master, seamless);
  notes.push(`${loop.id} crossfade offset ${fade.offset}s from ${fade.frames} frames`);
  const av1 = encodeAv1(seamless, path.join(outDir, `${loop.id}-720.webm`));
  const h264 = encodeH264(seamless, path.join(outDir, `${loop.id}-720.mp4`));
  posters(loop.master, loop.id);
  notes.push(`${loop.id} av1 crf ${av1.crf} ${av1.bytes} bytes, h264 ${h264} bytes`);
}

writeFileSync(
  path.join(outDir, "captions.vtt"),
  "WEBVTT\n\n00:00:00.000 --> 00:00:09.500\nSilent fly-through of deep space. No dialogue.\n",
);
notes.push("captions.vtt written");
notes.push("top tier 720. 1080 lanczos upscale not shipped.");
process.stdout.write(`${notes.join("\n")}\n`);
