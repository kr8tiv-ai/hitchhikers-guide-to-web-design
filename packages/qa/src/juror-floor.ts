/**
 * Idea 21. Give no juror a reason to mark the page down.
 * Each row is yes or no, with Playwright or axe evidence.
 * This is the floor under the scored report. It does not ban a library.
 */

import { jurorAxeEvidence } from "./a11y-gate.ts";
import { jurorHeadingEvidence } from "./detail-pass.ts";
import { jurorMobileEvidence } from "./mobile-checks.ts";

export const JUROR_FLOOR_ROWS = [
  "horizontal-overflow",
  "control-under-44",
  "keyboard-trap",
  "missing-focus",
  "text-under-16",
  "contrast-under-floor",
  "hover-only-control",
  "video-autoplay-sound",
  "reduced-motion-hides-content",
  "empty-heading",
  "fake-testimonial",
] as const;

export type JurorFloorRow = (typeof JUROR_FLOOR_ROWS)[number];

export interface JurorRow {
  id: JurorFloorRow;
  /** Yes means a juror has nothing to deduct on this row. */
  yes: boolean;
  evidence: string;
}

export interface JurorSample {
  scrollWidth: number;
  clientWidth: number;
  controls: readonly { width: number; height: number }[];
  keyboardTrap: boolean;
  missingFocus: boolean;
  textPx: readonly number[];
  contrastRatio: number;
  hoverOnlyControls: number;
  videos: readonly { autoplay: boolean; muted: boolean }[];
  reducedMotionHidesContent: boolean;
  headings: readonly string[];
  fakeTestimonials: boolean;
}

export interface JurorFloorReport {
  ok: boolean;
  rows: JurorRow[];
}

/** Measure the floor. A single no fails the page. */
export function measureJurorFloor(sample: JurorSample): JurorFloorReport {
  const mobile = jurorMobileEvidence(sample);
  const axe = jurorAxeEvidence(sample);
  const heading = jurorHeadingEvidence(sample.headings);
  const rows: JurorRow[] = [
    mobile.overflow,
    mobile.control,
    axe.keyboard,
    axe.focus,
    mobile.text,
    axe.contrast,
    mobile.hover,
    mobile.video,
    {
      id: "reduced-motion-hides-content",
      yes: !sample.reducedMotionHidesContent,
      evidence: sample.reducedMotionHidesContent
        ? "Playwright found content hidden on the reduced-motion path."
        : "Playwright found the reduced-motion path still showing the content.",
    },
    { id: "empty-heading", yes: heading.yes, evidence: heading.evidence },
    {
      id: "fake-testimonial",
      yes: !sample.fakeTestimonials,
      evidence: sample.fakeTestimonials
        ? "Playwright found a fake testimonial."
        : "Playwright found no fake testimonial.",
    },
  ];
  return { ok: rows.every((row) => row.yes), rows };
}
