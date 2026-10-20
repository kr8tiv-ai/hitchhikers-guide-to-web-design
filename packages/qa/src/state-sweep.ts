/**
 * Full state sweep on the device matrix (harness idea 24).
 * Eight fixtures, portrait and landscape, the iPhone SE 320px width, and a
 * 200% zoom pass. Hover is exercised only where the pointer is fine.
 * iOS Safari (WebKit iPhone 15) stays the P0 phone.
 */

import type { DeviceProject } from "./device-matrix.ts";

export const UI_STATES = [
  "default",
  "hover",
  "focus-visible",
  "active",
  "disabled",
  "loading",
  "error",
  "empty",
] as const;

export type UiState = (typeof UI_STATES)[number];

export const ZOOM_PERCENT = 200;

export interface StateFixture {
  state: UiState;
  html: string;
  hoverChanges: boolean;
}

export interface ZoomSample {
  scrollWidth: number;
  clientWidth: number;
  titleClipped: boolean;
}

export interface SweepSample {
  fixtures: readonly StateFixture[];
  zoom: ZoomSample;
  zoomPercent: number;
}

export interface SweepReport {
  ok: boolean;
  problems: readonly string[];
  states: readonly UiState[];
  projects: readonly string[];
  p0ProjectId: string;
  hoverByProject: Readonly<Record<string, "checked" | "skipped-coarse-pointer">>;
}

const MATRIX_IDS: readonly (readonly [string, string])[] = [
  ["iphone-15", "portrait"],
  ["iphone-15-landscape", "landscape"],
  ["pixel-7", "portrait"],
  ["pixel-7-landscape", "landscape"],
  ["ipad-pro-11", "portrait"],
  ["ipad-pro-11-landscape", "landscape"],
  ["galaxy-tab-s9", "portrait"],
  ["galaxy-tab-s9-landscape", "landscape"],
  ["desktop-1440", "desktop"],
  ["desktop-1920", "desktop"],
  ["iphone-se", "320px"],
];

export function stateFixture(state: UiState, hoverChanges = true): StateFixture {
  const extra: Record<UiState, string> = {
    default: "",
    hover: "<style>.control:hover { opacity: 0.8; }</style>",
    "focus-visible": "<style>.control:focus-visible { outline: 2px solid currentColor; }</style>",
    active: "",
    disabled: "disabled",
    loading: 'aria-busy="true"',
    error: 'role="alert"',
    empty: "",
  };
  return {
    state,
    html: `<section data-state="${state}" ${extra[state]}><h1>Title</h1><p>The state is visible.</p></section>`,
    hoverChanges: state === "hover" ? hoverChanges : false,
  };
}

export function evaluateStateSweeps(
  projects: readonly DeviceProject[],
  sample: (project: DeviceProject) => SweepSample,
  options?: { requireMatrix?: boolean },
): SweepReport {
  const requireMatrix = options?.requireMatrix !== false;
  const problems: string[] = [];
  const hoverByProject: Record<string, "checked" | "skipped-coarse-pointer"> = {};
  if (requireMatrix) problems.push(...matrixProblems(projects));

  for (const project of projects) {
    const taken = sample(project);
    const coarse = project.context.hasTouch;
    hoverByProject[project.id] = coarse ? "skipped-coarse-pointer" : "checked";
    problems.push(...fixtureProblems(project, taken.fixtures, coarse));
    problems.push(...zoomProblems(project.id, taken.zoom, taken.zoomPercent));
  }

  const phone = projects.find((item) => item.p0Phone && item.browser === "webkit");
  return {
    ok: problems.length === 0,
    problems,
    states: UI_STATES,
    projects: projects.map((item) => item.id),
    p0ProjectId: phone?.id ?? "iphone-15",
    hoverByProject,
  };
}

function matrixProblems(projects: readonly DeviceProject[]): string[] {
  const problems: string[] = [];
  const ids = new Set(projects.map((item) => item.id));
  if (!projects.some((item) => item.p0Phone && item.browser === "webkit")) {
    problems.push("iOS Safari (WebKit iPhone 15) is the P0 phone and is missing from the state sweep.");
  }
  for (const [id, kind] of MATRIX_IDS) {
    if (ids.has(id)) continue;
    problems.push(`The state sweep is missing the ${kind} project ${id}.`);
  }
  return problems;
}

function fixtureProblems(project: DeviceProject, fixtures: readonly StateFixture[], coarse: boolean): string[] {
  const problems: string[] = [];
  for (const state of UI_STATES) {
    const matches = fixtures.filter((item) => item.state === state);
    const fixture = matches[0];
    if (matches.length === 0 || fixture === undefined) {
      problems.push(`The ${state} fixture is missing on ${project.id}.`);
      continue;
    }
    if (matches.length > 1) problems.push(`The ${state} fixture is duplicated on ${project.id}.`);
    if (fixture.html.trim().length === 0) {
      problems.push(`The ${state} fixture on ${project.id} is empty.`);
      continue;
    }
    const marker = markerProblem(state, fixture.html);
    if (marker !== null) problems.push(`The ${state} fixture on ${project.id} ${marker}`);
    if (state === "hover" && !coarse) {
      if (!fixture.hoverChanges) {
        problems.push(`Hover does not change the control on ${project.id}. A fine pointer needs a hover state.`);
      }
      if (!fixture.html.includes(":hover")) {
        problems.push(`The hover fixture on ${project.id} has no :hover rule.`);
      }
    }
  }
  return problems;
}

function markerProblem(state: UiState, html: string): string | null {
  if (!html.includes(`data-state="${state}"`)) return `has no data-state="${state}" marker.`;
  if (state === "focus-visible" && !html.includes("focus-visible")) return "has no focus-visible marker.";
  if (state === "disabled" && !/\bdisabled\b/.test(html)) return "has no disabled marker.";
  if (state === "loading" && !html.includes('aria-busy="true"')) return "has no aria-busy marker.";
  if (state === "error" && !html.includes('role="alert"')) return "has no alert marker.";
  return null;
}

function zoomProblems(projectId: string, zoom: ZoomSample, zoomPercent: number): string[] {
  const problems: string[] = [];
  if (zoomPercent !== ZOOM_PERCENT) {
    problems.push(`The zoom pass on ${projectId} is ${zoomPercent}%. It must be ${ZOOM_PERCENT}%.`);
  }
  if (zoom.scrollWidth > zoom.clientWidth + 1) {
    problems.push(`200% zoom overflows horizontally on ${projectId}.`);
  }
  if (zoom.titleClipped) {
    problems.push(`200% zoom clips the title on ${projectId}.`);
  }
  return problems;
}
