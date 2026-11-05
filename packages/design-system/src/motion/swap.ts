/** Drop running recipes before Astro swaps the page. */
import { readDocument } from "./host.ts";
import type { MotionHandle } from "./types.ts";

export function bindAstroBeforeSwap(handles: readonly MotionHandle[]): () => void {
  const document = readDocument();
  const onSwap = (): void => {
    for (const handle of handles) handle.kill();
  };
  document.addEventListener("astro:before-swap", onSwap);
  return () => {
    document.removeEventListener("astro:before-swap", onSwap);
  };
}
