import { meta } from "./meta.ts";

export { meta };

export interface VideoEntry {
  title: string;
  poster: string;
  h264: string;
  webm: string;
  captions: string;
}

export function validateVideo(entry: VideoEntry): boolean {
  const paths = [entry.poster, entry.h264, entry.webm, entry.captions];
  if (entry.title.trim().length === 0) return false;
  if (!entry.h264.endsWith(".mp4") || !entry.webm.endsWith(".webm")) return false;
  return paths.every((item) => item.startsWith("/") && !item.includes(".."));
}

export function dryRunVideo(entry: VideoEntry): { ok: boolean; collection: "video"; selfHosted: true; sends: false } {
  return { ok: validateVideo(entry), collection: "video", selfHosted: true, sends: false };
}
