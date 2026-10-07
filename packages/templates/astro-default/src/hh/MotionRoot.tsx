"use client";

import { useEffect } from "react";

/**
 * Client boundary for the Next.js app router.
 * Mount this only on a page that chose Lenis. The blank page does not.
 */
export function MotionRoot(): null {
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancel = false;
    void import("./effects/lenis.ts").then(async (mod) => {
      const release = await mod.startLenis();
      if (cancel) release();
      else stop = release;
    });
    return () => {
      cancel = true;
      stop?.();
    };
  }, []);
  return null;
}
