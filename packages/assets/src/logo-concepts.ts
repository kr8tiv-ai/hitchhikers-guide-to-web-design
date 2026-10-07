/**
 * Ten logo directions and a priced render of four flat stills.
 *
 * Wordmarks and lettermarks describe personality only. Imagine is not
 * asked to draw the letters. Those are set in a real font later.
 * Symbol, combination, emblem, and wildcard prompts ask for a flat white
 * shape and forbid text, gradients, and mockups.
 *
 * quoteTopFour prices four grok-imagine-image stills through quoteJob
 * on the default resolution. renderFour calls runJobs only after confirm
 * is true and that quote fits the remaining budget.
 */

import { runJobs, type ImagineDeps, type ImagineRunResult } from "./imagine.ts";
import { assertFits, quoteJob, type StillJob } from "./prices.ts";

export type LogoKind =
  | "wordmark"
  | "lettermark"
  | "symbol"
  | "combination"
  | "emblem"
  | "wildcard";

export interface LogoDirection {
  id: string;
  kind: LogoKind;
  prompt: string;
}

export interface LogoRenderDeps {
  confirm: boolean;
  remainingUsd: number;
  fetch: typeof fetch;
  mode?: "diy" | "api";
  apiKey?: string;
  log?: (line: string) => void;
  name?: string;
  directions?: readonly LogoDirection[];
  indexes?: readonly number[];
}

const STILL_COUNT = 4;
const INDEX_MIN = 0;
const INDEX_MAX = 9;

const TYPE_LATER =
  "do not render letters. Describe the personality only. The letters will be set in a real font later. no gradient. no mockup. no text.";

const FLAT =
  "flat white shape on a plain background, no text, no gradient, no mockup. do not render letters.";

interface Seed {
  kind: LogoKind;
  line: (name: string) => string;
}

const SEEDS: readonly Seed[] = [
  {
    kind: "wordmark",
    line: (name) => `Personality word ${name}. Quiet, wide, and dry. ${TYPE_LATER}`,
  },
  {
    kind: "wordmark",
    line: (name) => `Personality word ${name}. Compact, heavy, and sure. ${TYPE_LATER}`,
  },
  {
    kind: "lettermark",
    line: (name) => `Personality word ${name}. Tight, close, and shared. ${TYPE_LATER}`,
  },
  {
    kind: "lettermark",
    line: (name) => `Personality word ${name}. Tall, narrow, and stacked. ${TYPE_LATER}`,
  },
  {
    kind: "symbol",
    line: (name) =>
      `Personality word ${name}. One folded ribbon with a single crease, centered. ${FLAT}`,
  },
  {
    kind: "symbol",
    line: (name) => `Personality word ${name}. A circle missing one short arc, centered. ${FLAT}`,
  },
  {
    kind: "combination",
    line: (name) =>
      `Personality word ${name}. A small square notch that will sit beside the name. The name is not drawn. ${FLAT}`,
  },
  {
    kind: "combination",
    line: (name) =>
      `Personality word ${name}. A short horizontal bar that will sit above the name. The name is not drawn. ${FLAT}`,
  },
  {
    kind: "emblem",
    line: (name) =>
      `Personality word ${name}. A circular badge of one ring and one notch, the center stays empty. ${FLAT}`,
  },
  {
    kind: "wildcard",
    line: (name) =>
      `Personality word ${name}. Break symmetry on purpose: a circle with one squared corner, still one flat piece. ${FLAT}`,
  },
];

export function logoDirections(name: string): LogoDirection[] {
  const safe = safeName(name);
  return SEEDS.map((seed, index) => ({
    id: `logo-${String(index + 1).padStart(2, "0")}`,
    kind: seed.kind,
    prompt: seed.line(safe),
  }));
}

/** Price of four default grok-imagine-image stills. The line shows the dollars. */
export function quoteTopFour(): { usd: number; line: string } {
  const quoted = quoteJob(fourStillJob(FLAT));
  return {
    usd: quoted.usd,
    line: `${quoted.line}. Four stills: $${quoted.usd.toFixed(2)}.`,
  };
}

/** Four directions from the sheet. Indexes outside 0..9 throw. Prices the four stills. */
export function pickFour(
  list: readonly LogoDirection[],
  indexes: readonly number[],
): LogoDirection[] {
  const directions = takeFour(list, indexes);
  const quoted = quoteJob(fourStillJob(directions.map((direction) => direction.id).join(" ")));
  if (quoted.usd !== quoteTopFour().usd) {
    throw new Error("Logo pick price drifted from the top-four quote.");
  }
  return directions;
}

/**
 * Paid path. confirm false throws before any Imagine call.
 * A quote above remainingUsd throws CapExceeded, including DIY mode.
 * Four chosen directions go out as four still jobs so each prompt stays its own.
 */
export async function renderFour(deps: LogoRenderDeps): Promise<ImagineRunResult> {
  if (deps === null || typeof deps !== "object") {
    throw new Error("renderFour needs deps.");
  }
  if (deps.confirm !== true) {
    throw new Error("Logo stills need confirm true before Imagine is called.");
  }
  const quoted = quoteTopFour();
  assertFits(quoted, deps.remainingUsd);
  const directions = directionsForRender(deps);
  const jobs = directions.map((direction) => oneStill(direction.prompt));
  return runJobs(jobs, toImagineDeps(deps));
}

function fourStillJob(prompt: string): StillJob {
  return {
    kind: "still",
    model: "grok-imagine-image",
    resolution: "default",
    prompt,
    count: STILL_COUNT,
  };
}

function oneStill(prompt: string): StillJob {
  return {
    kind: "still",
    model: "grok-imagine-image",
    resolution: "default",
    prompt,
    count: 1,
  };
}

function safeName(name: string): string {
  if (typeof name !== "string") {
    throw new Error("Logo name must be text.");
  }
  const cleaned = name
    .replaceAll("<", "")
    .replaceAll("!", "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) {
    throw new Error("Logo name must not be empty.");
  }
  return cleaned;
}

function takeFour(list: readonly LogoDirection[], indexes: readonly number[]): LogoDirection[] {
  if (!Array.isArray(list)) {
    throw new Error("Logo directions must be a list.");
  }
  if (!Array.isArray(indexes) || indexes.length !== STILL_COUNT) {
    throw new Error("pickFour needs four indexes inside 0..9.");
  }
  const seen = new Set<number>();
  const picked: LogoDirection[] = [];
  for (const index of indexes) {
    if (typeof index !== "number" || !Number.isInteger(index) || index < INDEX_MIN || index > INDEX_MAX) {
      throw new Error(`Logo index ${String(index)} is outside 0..9.`);
    }
    if (seen.has(index)) {
      throw new Error(`Logo index ${String(index)} is repeated. Use four unique indexes inside 0..9.`);
    }
    seen.add(index);
    const direction = list[index];
    if (direction === undefined) {
      throw new Error(`Logo index ${String(index)} is outside the direction list.`);
    }
    picked.push(direction);
  }
  return picked;
}

function directionsForRender(deps: LogoRenderDeps): readonly LogoDirection[] {
  if (deps.directions !== undefined && deps.indexes === undefined && deps.directions.length === STILL_COUNT) {
    return deps.directions.map((direction) => checked(direction));
  }
  if (deps.indexes === undefined) {
    throw new Error("renderFour needs four indexes, or four directions.");
  }
  const list = deps.directions ?? (deps.name === undefined ? undefined : logoDirections(deps.name));
  if (list === undefined) {
    throw new Error("renderFour needs a direction list or a name.");
  }
  return pickFour(list, deps.indexes).map((direction) => checked(direction));
}

function checked(direction: LogoDirection): LogoDirection {
  if (direction === null || typeof direction !== "object" || typeof direction.prompt !== "string") {
    throw new Error("Each logo direction needs a prompt.");
  }
  const prompt = direction.prompt;
  if (prompt.includes("!")) {
    throw new Error("Logo prompts must not include an exclamation mark.");
  }
  if (!prompt.includes("do not render letters") && !prompt.includes("no text")) {
    throw new Error("Logo prompts must forbid rendered lettering.");
  }
  if (!prompt.includes("no gradient")) {
    throw new Error("Logo prompts must forbid a gradient.");
  }
  if (!prompt.includes("no mockup")) {
    throw new Error("Logo prompts must forbid a mockup.");
  }
  if (/signature/i.test(prompt)) {
    throw new Error("Logo prompts must not ask for a signature.");
  }
  return direction;
}

function toImagineDeps(deps: LogoRenderDeps): ImagineDeps {
  const mode = deps.mode ?? "api";
  const base = {
    mode,
    remainingUsd: deps.remainingUsd,
    fetch: deps.fetch,
  };
  if (deps.apiKey !== undefined && deps.log !== undefined) {
    return { ...base, apiKey: deps.apiKey, log: deps.log };
  }
  if (deps.apiKey !== undefined) {
    return { ...base, apiKey: deps.apiKey };
  }
  if (deps.log !== undefined) {
    return { ...base, log: deps.log };
  }
  return base;
}
