/**
 * Image variants (AVIF and WebP) and scroll-video encodes.
 * Video uses ffmpeg when it is on PATH. A missing ffmpeg skips video
 * with a clear message and does not fail the image plan.
 */

import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

export const IMAGE_WIDTHS = [640, 960, 1280, 1920] as const;
export const KEYFRAME_INTERVAL = 2;
export const FFMPEG_MISSING = "ffmpeg is not installed. Video encoding was skipped.";

export interface ImageOutput {
  format: "avif" | "webp";
  width: number;
  file: string;
}

export interface ImagePlan {
  input: string;
  outputs: ImageOutput[];
}

export interface VideoPlan {
  input: string;
  h264: string;
  webm: string;
  keyframeInterval: number;
  skipped?: string;
}

export interface OptimizeReport {
  images: ImagePlan[];
  videos: VideoPlan[];
}

interface SharpPipeline {
  resize(width: number): SharpPipeline;
  avif(options: { quality: number }): SharpPipeline;
  webp(options: { quality: number }): SharpPipeline;
  toFile(file: string): Promise<unknown>;
}

type SharpFactory = (input: string) => SharpPipeline;

function stem(file: string): string {
  return path.basename(file, path.extname(file));
}

export function planImages(inputPath: string, outDir: string): ImagePlan {
  const base = stem(inputPath);
  const outputs: ImageOutput[] = [];
  for (const width of IMAGE_WIDTHS) {
    outputs.push(
      { format: "avif", width, file: path.join(outDir, `${base}-${width}.avif`) },
      { format: "webp", width, file: path.join(outDir, `${base}-${width}.webp`) },
    );
  }
  return { input: inputPath, outputs };
}

export function planVideo(inputPath: string, outDir: string): VideoPlan {
  const base = stem(inputPath);
  return {
    input: inputPath,
    h264: path.join(outDir, `${base}.mp4`),
    webm: path.join(outDir, `${base}.webm`),
    keyframeInterval: KEYFRAME_INTERVAL,
  };
}

export function ffmpegArgs(input: string, output: string, codec: "h264" | "webm"): string[] {
  const shared = ["-y", "-i", input, "-an", "-g", String(KEYFRAME_INTERVAL), "-keyint_min", String(KEYFRAME_INTERVAL)];
  if (codec === "h264") {
    return [...shared, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output];
  }
  return [...shared, "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", output];
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      windowsHide: true,
      detached: false,
    });
    let errorText = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      errorText += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorText.trim() || `${command} exited ${code}`));
    });
  });
}

export async function findFfmpeg(): Promise<string | null> {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    await runCommand(locator, ["ffmpeg"]);
  } catch {
    return null;
  }
  return "ffmpeg";
}

async function loadSharp(): Promise<SharpFactory> {
  const mod: unknown = await import("sharp");
  const factory = typeof mod === "function" ? mod : isRecord(mod) ? mod.default : undefined;
  if (typeof factory !== "function") throw new Error("sharp is not installed. Image encoding was skipped.");
  return factory as SharpFactory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function encodeImage(plan: ImagePlan): Promise<void> {
  const sharp = await loadSharp();
  await stat(plan.input);
  for (const output of plan.outputs) {
    await mkdir(path.dirname(output.file), { recursive: true });
    const pipeline = sharp(plan.input).resize(output.width);
    if (output.format === "avif") await pipeline.avif({ quality: 50 }).toFile(output.file);
    else await pipeline.webp({ quality: 72 }).toFile(output.file);
  }
}

export async function encodeVideo(plan: VideoPlan, ffmpeg: string): Promise<void> {
  await mkdir(path.dirname(plan.h264), { recursive: true });
  await runCommand(ffmpeg, ffmpegArgs(plan.input, plan.h264, "h264"));
  await runCommand(ffmpeg, ffmpegArgs(plan.input, plan.webm, "webm"));
}

export async function optimizeMedia(options: {
  images?: readonly string[];
  videos?: readonly string[];
  outDir: string;
  ffmpeg?: string | null;
  dryRun?: boolean;
}): Promise<OptimizeReport> {
  const outDir = options.outDir;
  const images = (options.images ?? []).map((file) => planImages(file, outDir));
  const ffmpeg = options.ffmpeg === undefined ? await findFfmpeg() : options.ffmpeg;
  const videos: VideoPlan[] = [];
  for (const file of options.videos ?? []) {
    const plan = planVideo(file, outDir);
    if (ffmpeg === null) plan.skipped = FFMPEG_MISSING;
    videos.push(plan);
  }
  if (options.dryRun === true) return { images, videos };
  for (const plan of images) await encodeImage(plan);
  if (ffmpeg !== null) {
    for (const plan of videos) {
      if (plan.skipped !== undefined) continue;
      await encodeVideo(plan, ffmpeg);
    }
  }
  return { images, videos };
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"));

if (invokedDirectly) {
  const outDir = argValue("--out") ?? path.join(process.cwd(), "public", "media");
  const images = process.argv.includes("--image") ? process.argv.filter((_, index) => process.argv[index - 1] === "--image") : [];
  const videos = process.argv.includes("--video") ? process.argv.filter((_, index) => process.argv[index - 1] === "--video") : [];
  const report = await optimizeMedia({ images, videos, outDir });
  for (const video of report.videos) {
    if (video.skipped !== undefined) console.log(video.skipped);
  }
  console.log(JSON.stringify({ images: report.images.length, videos: report.videos.length }));
}
