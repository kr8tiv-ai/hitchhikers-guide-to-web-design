/**
 * One Grok spec-build for a design-library entry.
 * Manual commands only. Tests inject their own runner and never import this file.
 */
import { spawn } from "node:child_process";
import type { GrokEntryDraft } from "../src/ingest-pipeline.ts";

export function grokLibraryRunner(input: { url: string; mode: string; material: string }): Promise<GrokEntryDraft> {
  const prompt = [
    "Write a design-library entry as JSON.",
    "Fields: title, techniques, promptLanguage, notes, perfCost, reducedMotion, moods, sectionTypes, libraries, styleWorld, family, kind, source.",
    "Prompt language is one or two sentences in our own words. Remix the idea. Do not copy the page.",
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
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Grok did not write an entry."));
        return;
      }
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start === -1 || end === -1) {
        reject(new Error("Grok did not return JSON."));
        return;
      }
      resolve(JSON.parse(stdout.slice(start, end + 1)) as GrokEntryDraft);
    });
  });
}
