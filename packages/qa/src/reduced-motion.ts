/**
 * Reduced motion on every device project, including WebKit (audit 11).
 * The preference is the switch. A phone width keeps the picture and does
 * not select the tier-0 still. Opacity at or under the shared heuristic
 * may stay. Lenis is optional.
 */

import type { DeviceProject } from "./device-matrix.ts";
import {
  OPACITY_KEEP_MS,
  OPACITY_KEEP_NOTE,
  classifyMotion,
  posesMatch,
  stillIsArtDirected,
  type TierZeroStill,
} from "@hitchhiker/engine";

export { OPACITY_KEEP_MS, OPACITY_KEEP_NOTE, classifyMotion, posesMatch, stillIsArtDirected };
export type { TierZeroStill };

export interface MotionSection {
  id: string;
  text: string;
  image: string;
}

export interface LenisMotion {
  respectReducedMotion: boolean;
  smoothingActive: boolean;
}

export interface ReducedSample {
  projectId: string;
  viewportWidth: number;
  prefersReducedMotion: boolean;
  sections: readonly MotionSection[];
  lenis: LenisMotion | null;
  parallax: boolean;
  scrub: boolean;
  cameraMoving: boolean;
  autoplay: boolean;
  canvasLoopStarted: boolean;
  opacityDurationMs: number | null;
  pinned: boolean;
  revealedOnlyByScroll: boolean;
  has3d: boolean;
  scene: TierZeroStill | null;
  still: TierZeroStill | null;
  treatedWidthAsReducedMotion: boolean;
  widthSelectedStill: boolean;
}

export interface ReducedReport {
  projectId: string;
  browser: DeviceProject["browser"];
  ok: boolean;
  problems: readonly string[];
  reduced: boolean;
}

export interface ReducedRun {
  ok: boolean;
  problems: readonly string[];
  reports: readonly ReducedReport[];
}

export function runReducedMotion(
  projects: readonly DeviceProject[],
  sampleFor: (project: DeviceProject) => ReducedSample,
): ReducedRun {
  const reports = projects.map((project) => evaluateReducedMotion(project, sampleFor(project)));
  const problems = reports.flatMap((report) => [...report.problems]);
  if (!projects.some((project) => project.browser === "webkit")) {
    problems.push(
      "WebKit is missing. iOS Safari is the P0 phone, so reduced motion runs on a WebKit project.",
    );
  }
  return { ok: problems.length === 0, problems, reports };
}

export function evaluateReducedMotion(project: DeviceProject, sample: ReducedSample): ReducedReport {
  const problems: string[] = [];
  const policy = classifyMotion({
    prefersReducedMotion: sample.prefersReducedMotion,
    viewportWidth: sample.viewportWidth,
  });
  if (sample.projectId !== project.id) {
    problems.push(`Sample project ${sample.projectId} does not match ${project.id}.`);
  }
  if (sample.viewportWidth !== project.context.viewport.width) {
    problems.push(
      `Sample width ${sample.viewportWidth} does not match the ${project.id} viewport ${project.context.viewport.width}.`,
    );
  }
  if (sample.treatedWidthAsReducedMotion || policy.reduced !== sample.prefersReducedMotion) {
    problems.push(
      `The width ${sample.viewportWidth} was classified as reduced motion. prefers-reduced-motion is the only switch.`,
    );
  }
  if (sample.widthSelectedStill || policy.widthSelectsStill) {
    problems.push(`The width ${sample.viewportWidth} selected the still. A phone width keeps the picture.`);
  }
  if (policy.reduced) checkReduced(sample, problems);
  return {
    projectId: project.id,
    browser: project.browser,
    ok: problems.length === 0,
    problems,
    reduced: policy.reduced,
  };
}

function checkReduced(sample: ReducedSample, problems: string[]): void {
  if (sample.sections.length === 0) problems.push("No section text was measured under reduced motion.");
  for (const section of sample.sections) {
    if (section.text.trim() === "") problems.push(`Section ${section.id} is missing its text.`);
    if (section.image.trim() === "") problems.push(`Section ${section.id} is missing its image.`);
  }
  if (sample.pinned) problems.push("A pinned section stays pinned under reduced motion.");
  if (sample.revealedOnlyByScroll) problems.push("Content appears only after scroll under reduced motion.");
  if (sample.lenis !== null) {
    if (!sample.lenis.respectReducedMotion) {
      problems.push("Lenis respectReducedMotion is false. Smoothing has to stay off.");
    }
    if (sample.lenis.smoothingActive) problems.push("Lenis smoothing is on under reduced motion.");
  }
  if (sample.parallax) problems.push("The parallax effect is still running under reduced motion.");
  if (sample.scrub) problems.push("Scroll scrub is still running under reduced motion.");
  if (sample.cameraMoving) problems.push("The camera is still moving under reduced motion.");
  if (sample.autoplay) problems.push("Video autoplay is on under reduced motion.");
  if (sample.canvasLoopStarted) problems.push("The canvas loop started under reduced motion.");
  if (sample.opacityDurationMs !== null && sample.opacityDurationMs > OPACITY_KEEP_MS) {
    problems.push(
      `Opacity runs for ${sample.opacityDurationMs} ms. Opacity over ${OPACITY_KEEP_MS} ms fails. ${OPACITY_KEEP_NOTE}`,
    );
  }
  if (!sample.has3d) return;
  if (sample.scene === null || sample.still === null) {
    problems.push("The 3D scene has no tier-0 still.");
    return;
  }
  if (!stillIsArtDirected(sample.still)) problems.push("The tier-0 still is not art-directed.");
  if (!posesMatch(sample.scene, sample.still)) {
    problems.push("The tier-0 still does not match the scene camera, grade, and lighting.");
  }
}
