/**
 * One token set per style world.
 * Ratios match TYPE_SCALE in the engine for the four shared worlds.
 * Editorial spacing matches the quiet scale already written in DESIGN.md.
 */
import { typeSteps } from "./scale.ts";
import type { StyleWorld, TypeStep } from "./types.ts";

export interface WorldSet {
  world: StyleWorld;
  spacing: readonly string[];
  radii: readonly { name: string; value: string }[];
  durations: { reveal: string; hover: string; stagger: string };
  easings: { reveal: string; hover: string; track: string };
  steps: readonly TypeStep[];
}

interface WorldSpec {
  world: StyleWorld;
  ratio: number;
  minDisplayOverBody: number;
  spacingPx: readonly number[];
  radiiPx: readonly number[];
  durations: { reveal: string; hover: string; stagger: string };
  easings: { reveal: string; hover: string; track: string };
}

const SPECS: readonly WorldSpec[] = [
  {
    world: "editorial",
    ratio: 1.333,
    minDisplayOverBody: 3.2,
    spacingPx: [4, 8, 12, 16, 24, 40, 64, 96],
    radiiPx: [2, 8, 20],
    durations: { reveal: "0.9s", hover: "0.45s", stagger: "0.08s" },
    easings: { reveal: "expo.out", hover: "power2.out", track: "none" },
  },
  {
    world: "3d-world",
    ratio: 1.414,
    minDisplayOverBody: 3.5,
    spacingPx: [8, 16, 24, 32, 48, 64, 96, 128],
    radiiPx: [0, 2, 4],
    durations: { reveal: "1.2s", hover: "0.6s", stagger: "0.1s" },
    easings: { reveal: "power3.out", hover: "power2.out", track: "none" },
  },
  {
    world: "playful",
    ratio: 1.25,
    minDisplayOverBody: 2.6,
    spacingPx: [6, 10, 16, 20, 28, 44, 72, 112],
    radiiPx: [16, 28, 999],
    durations: { reveal: "0.7s", hover: "0.35s", stagger: "0.06s" },
    easings: { reveal: "back.out(1.2)", hover: "power1.out", track: "none" },
  },
  {
    world: "brutalist",
    ratio: 1.5,
    minDisplayOverBody: 4,
    spacingPx: [2, 4, 8, 16, 32, 48, 64, 96],
    radiiPx: [0, 0, 0],
    durations: { reveal: "0.2s", hover: "0.12s", stagger: "0.02s" },
    easings: { reveal: "none", hover: "none", track: "none" },
  },
];

const RADIUS_NAMES = ["sm", "md", "lg"] as const;

function worldSet(spec: WorldSpec): WorldSet {
  return {
    world: spec.world,
    spacing: spec.spacingPx.map((px) => `${px}px`),
    radii: spec.radiiPx.map((px, index) => ({
      name: RADIUS_NAMES[index] ?? `r${index + 1}`,
      value: `${px}px`,
    })),
    durations: spec.durations,
    easings: spec.easings,
    steps: typeSteps(spec.ratio, spec.minDisplayOverBody),
  };
}

const WORLDS = new Map<StyleWorld, WorldSet>(SPECS.map((spec) => [spec.world, worldSet(spec)]));

export function worldSetFor(world: StyleWorld): WorldSet {
  const set = WORLDS.get(world);
  if (set === undefined) throw new Error(`Unknown style world ${world}.`);
  return set;
}
