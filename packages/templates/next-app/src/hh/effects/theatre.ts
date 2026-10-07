/**
 * Theatre core on the shared ticker. Studio is not imported.
 * State is the checked-in JSON at /theatre/home.json.
 */

import { prefersReducedMotion, type Ticker } from "../motion.ts";
import { fetchState, playState, type TheatreCoreLike } from "../theatre-loader.ts";
import { readPowerSignals, shouldUsePoster } from "../webgl.ts";

export async function playCheckedInScene(url = "/theatre/home.json"): Promise<() => void> {
  const signals = readPowerSignals();
  if (prefersReducedMotion() || shouldUsePoster(signals)) return () => {};
  const state = await fetchState(url);
  const core = (await import("@theatre/core")) as unknown as TheatreCoreLike;
  const gsapMod = (await import("gsap")) as unknown as {
    default: { ticker: Ticker };
  };
  const ticker: Ticker = {
    add: (fn) => {
      gsapMod.default.ticker.add(fn);
    },
    remove: (fn) => {
      gsapMod.default.ticker.remove(fn);
    },
    lagSmoothing: () => {},
  };
  return playState(state, core, ticker, { reducedMotion: false, phone: false });
}
