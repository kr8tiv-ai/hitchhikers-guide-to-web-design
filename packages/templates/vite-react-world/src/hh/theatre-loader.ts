/**
 * Plays a checked-in Theatre state with @theatre/core only.
 * The gsap ticker calls driver.tick. Theatre does not open its own loop.
 * The studio package stays out of this file.
 */

import type { Ticker } from "./motion.ts";

export interface RafDriverLike {
  tick(timeMs: number): void;
}

export interface TheatreSequenceLike {
  play(options: { rafDriver: RafDriverLike }): void;
  pause(): void;
}

export interface TheatreCoreLike {
  getProject(
    id: string,
    config: { state: object },
  ): {
    ready: Promise<unknown>;
    sheet(name: string): { sequence: TheatreSequenceLike };
  };
  createRafDriver(options: { name: string }): RafDriverLike;
}

export interface PlayOptions {
  reducedMotion?: boolean;
  phone?: boolean;
  projectId?: string;
  sheetName?: string;
}

export function parseState(text: string): object {
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Theatre state must be a JSON object.");
  }
  return parsed;
}

export async function fetchState(url: string): Promise<object> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Theatre state failed to load: ${response.status}`);
  return parseState(await response.text());
}

/**
 * Pins playback to the shared ticker.
 * Reduced motion and the phone path return a no-op.
 */
export function playState(
  state: object,
  core: TheatreCoreLike,
  ticker: Ticker,
  options: PlayOptions = {},
): () => void {
  if (options.reducedMotion === true || options.phone === true) return () => {};
  const driver = core.createRafDriver({ name: "gsap.ticker" });
  const tick = (time: number): void => {
    driver.tick(time * 1000);
  };
  ticker.add(tick);
  const project = core.getProject(options.projectId ?? "hh-scene", { state });
  const sequence = project.sheet(options.sheetName ?? "Hero").sequence;
  void project.ready.then(() => {
    sequence.play({ rafDriver: driver });
  });
  return () => {
    sequence.pause();
    ticker.remove(tick);
  };
}
