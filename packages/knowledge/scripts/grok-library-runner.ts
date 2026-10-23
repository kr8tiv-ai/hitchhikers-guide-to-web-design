/**
 * One Grok spec-build for a design-library entry.
 * Manual commands only. Tests inject their own runner and never import this file.
 */
import { spawn } from "node:child_process";
import type { GrokEntryDraft, GrokVocabulary } from "../src/ingest-pipeline.ts";

/** A spec build that has not answered in this long is stopped and recorded as failed. */
const GROK_TIMEOUT_MS = 15 * 60 * 1000;

export function grokLibraryRunner(input: { url: string; mode: string; material: string; vocabulary?: GrokVocabulary }): Promise<GrokEntryDraft> {
  const vocab = input.vocabulary;
  const prompt = [
    "Write a design-library entry as JSON.",
    "Fields: title, techniques, promptLanguage, notes, perfCost, reducedMotion, moods, sectionTypes, libraries, styleWorld, family, kind, source.",
    "Prompt language is one or two sentences in our own words. Remix the idea. Do not copy the page.",
    "notes is one or two sentences of our own observation. reducedMotion is exactly one sentence. No URL, no exclamation mark, no em dash in prose fields.",
    ...(vocab === undefined
      ? []
      : [
          `techniques: one to four, only from: ${vocab.techniques.join(", ")}`,
          `moods: two to six, only from: ${vocab.moods.join(", ")}`,
          `sectionTypes: one or more, only from: ${vocab.sectionTypes.join(", ")}`,
          `libraries: only from: ${vocab.libraries.join(", ")}`,
          `family: one of: ${Object.keys(vocab.families).join(", ")}. styleWorld follows the family: ${Object.entries(vocab.families).map(([family, world]) => `${family}=${world}`).join(", ")}`,
          "perfCost: low, medium, or high. kind: site.",
        ]),
    `Mode: ${input.mode}`,
    `URL: ${input.url}`,
    "Material:",
    input.material.slice(0, 6000),
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "grok",
      ["--no-auto-update", "--no-alt-screen", "-m", "grok-4.7-build-fast", "--effort", "xhigh", "-p", prompt],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Grok timed out."));
    }, GROK_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Grok did not write an entry (exit ${code}).`));
        return;
      }
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start === -1 || end === -1) {
        reject(new Error("Grok did not return JSON."));
        return;
      }
      try {
        resolve(JSON.parse(stdout.slice(start, end + 1)) as GrokEntryDraft);
      } catch {
        reject(new Error("Grok returned JSON that could not be parsed."));
      }
    });
  });
}
