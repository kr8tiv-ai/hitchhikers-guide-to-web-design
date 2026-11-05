import type { MotionHandle } from "./types.ts";

/** kill() runs the cleanup once. A second call is a no-op. */
export function motionHandle(reduced: boolean, refresh: () => void, cleanup: () => void): MotionHandle {
  let dead = false;
  return {
    reduced,
    refresh() {
      if (dead) return;
      refresh();
    },
    kill() {
      if (dead) return;
      dead = true;
      cleanup();
    },
  };
}
