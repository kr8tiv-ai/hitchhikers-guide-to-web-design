/**
 * Scoped anime.js stagger. GSAP does not own the same element.
 * The library loads only when staggerMarks runs.
 */

interface AnimeScope {
  revert(): void;
}

interface AnimeApi {
  animate: (targets: string, params: Record<string, unknown>) => void;
  createScope: (options: { root: ParentNode & Element }) => { add: (setup: () => void) => AnimeScope };
  stagger: (ms: number) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asAnime(mod: unknown): AnimeApi {
  const record = isRecord(mod) ? mod : {};
  const animate = record.animate;
  const createScope = record.createScope;
  const stagger = record.stagger;
  if (typeof animate !== "function" || typeof createScope !== "function" || typeof stagger !== "function") {
    throw new Error("animejs did not load.");
  }
  return record as unknown as AnimeApi;
}

export function staggerOpacity(reduced: boolean): "1" | null {
  return reduced ? "1" : null;
}

export async function staggerMarks(root: ParentNode & Element): Promise<() => void> {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    for (const node of root.querySelectorAll("path")) {
      if (node instanceof SVGElement) node.style.opacity = staggerOpacity(true) ?? "1";
    }
    return () => {};
  }
  const anime = asAnime(await import("animejs"));
  const scope = anime.createScope({ root }).add(() => {
    anime.animate("path", {
      opacity: [0, 1],
      delay: anime.stagger(80),
      duration: 700,
      ease: "outCubic",
    });
  });
  return () => {
    scope.revert();
  };
}
