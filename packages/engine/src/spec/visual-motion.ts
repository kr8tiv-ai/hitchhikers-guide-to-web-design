/**
 * Effect requests for the visual build phase.
 * The art direction chooses the starting kinds. planMotion assigns libraries.
 * A motion score sets intensity and cost. It never removes the hero,
 * the scroll owner, the reveals, or the transitions.
 */

import type { ArtDirection } from "./art-direction.ts";
import type { EffectRequest } from "./motion.ts";

export interface VisualPage {
  id: string;
  sections: readonly string[];
}

function heroSection(page: VisualPage): string {
  return page.sections.find((id) => id === "hero" || id.endsWith("-hero")) ?? page.sections[0] ?? "hero";
}

function revealSection(page: VisualPage): string {
  const hero = heroSection(page);
  return (
    page.sections.find((id) => /farm|card|grid/i.test(id)) ??
    page.sections.find((id) => id !== hero) ??
    hero
  );
}

export function sectionForMotion(sections: readonly string[], element: string): string {
  const page = { id: "page", sections };
  if (element === "staggered-reveals") return revealSection(page);
  return heroSection(page);
}

function wantsParallax(art: ArtDirection): boolean {
  return /parallax/i.test(
    [art.signatureHero, art.scroll, art.reveals, art.motion.techniques.join(" ")].join("\n"),
  );
}

function wantsWebglHero(art: ArtDirection): boolean {
  return (
    art.motion.score >= 8 &&
    art.motion.performanceCost !== "low" &&
    (art.styleWorld === "3d-world" || /three|shader|island/i.test(art.signatureHero))
  );
}

export function visualMotionRequests(pages: readonly VisualPage[], art: ArtDirection): EffectRequest[] {
  const quiet = art.motion.score <= 3;
  const first = pages.find((page) => page.sections.length > 0);
  const webglHero = wantsWebglHero(art);
  const parallax = wantsParallax(art);
  const requests: EffectRequest[] = [];
  for (const page of pages) {
    if (page.sections.length === 0) continue;
    if (quiet) {
      requests.push({ id: `${page.id}-scroll`, kind: "css-scroll", element: "page-scroll", page: page.id });
    } else {
      requests.push({
        id: `${page.id}-scroll`,
        kind: "smooth-scroll",
        element: "documentElement",
        page: page.id,
      });
    }
    const reveal = revealSection(page);
    if (page === first || /farm|card|grid/i.test(reveal)) {
      requests.push({
        id: `${page.id}-reveal`,
        kind: "light-reveal",
        element: "staggered-reveals",
        page: page.id,
      });
    }
  }
  if (first !== undefined) {
    requests.push({
      id: `${first.id}-hero-signature`,
      kind: quiet ? "light-reveal" : webglHero ? "3d" : "scroll-sequence",
      element: webglHero && !quiet ? "hero-scene" : "hero-media",
      page: first.id,
    });
    requests.push({
      id: `${first.id}-transition`,
      kind: quiet ? "light-reveal" : "text-split",
      element: "section-transition",
      page: first.id,
    });
    if (parallax) {
      requests.push({
        id: `${first.id}-parallax`,
        kind: quiet ? "light-reveal" : "scroll-sequence",
        element: "layered-media",
        page: first.id,
      });
    }
  }
  return requests;
}
