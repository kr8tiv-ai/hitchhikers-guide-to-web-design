/**
 * One opacity change with IntersectionObserver. No motion package.
 */

export function fadeTargetOpacity(reduced: boolean, visible: boolean): "1" | null {
  if (reduced || visible) return "1";
  return null;
}

export function fadeOnView(node: HTMLElement): () => void {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const immediate = fadeTargetOpacity(reduced, false);
  if (immediate !== null) {
    node.style.opacity = immediate;
    return () => {};
  }
  if (typeof IntersectionObserver === "undefined") {
    node.style.opacity = "1";
    return () => {};
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
      const next = fadeTargetOpacity(false, true);
      if (next !== null) entry.target.style.opacity = next;
      observer.unobserve(entry.target);
    }
  });
  observer.observe(node);
  return () => {
    observer.disconnect();
  };
}
