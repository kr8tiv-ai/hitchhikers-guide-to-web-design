/// <reference lib="dom" />

import { weightCeiling } from "./slider.ts";

export type MotionTool =
  | "gsap"
  | "css-scroll"
  | "three"
  | "ogl"
  | "motion"
  | "anime"
  | "theatre"
  | "lenis"
  | "vanilla";

export interface MotionFamily {
  id: string;
  researchIds: string[];
  label: string;
  tool: MotionTool;
  toolClause: string;
  examples: string[];
  minLevel: number;
  mount(el: HTMLElement): Promise<() => void>;
}

interface PreviewModule {
  mountPreview(el: HTMLElement): Promise<() => void>;
}

function mountFrom(load: () => Promise<PreviewModule>, el: HTMLElement): Promise<() => void> {
  return load().then((mod) => mod.mountPreview(el));
}

export const families: MotionFamily[] = [
  {
    id: "tiny-fade",
    researchIds: ["H1", "H2", "H3"],
    label: "Load fade",
    tool: "vanilla",
    toolClause: "Vanilla JS fades the panel in and leaves sound off.",
    examples: ["https://www.franshalsmuseum.nl/en/"],
    minLevel: 1,
    mount: (el) => mountFrom(() => import("./previews/vanilla-fade.ts"), el),
  },
  {
    id: "light-reveal",
    researchIds: ["A2", "A5"],
    label: "Light reveal",
    tool: "css-scroll",
    toolClause:
      "CSS scroll-driven animation reveals the line, with a keyframe fallback where animation-timeline is missing.",
    examples: ["https://www.franshalsmuseum.nl/en/", "https://pangrampangram.com"],
    minLevel: 2,
    mount: (el) => mountFrom(() => import("./previews/css-scroll.ts"), el),
  },
  {
    id: "spring-ui",
    researchIds: ["D4", "D5"],
    label: "Spring control",
    tool: "motion",
    toolClause: "Motion's animate springs the control back to rest.",
    examples: ["https://motion.dev/"],
    minLevel: 2,
    mount: (el) => mountFrom(() => import("./previews/motion-spring.ts"), el),
  },
  {
    id: "smooth-scroll",
    researchIds: ["A1"],
    label: "Weighted scroll",
    tool: "lenis",
    toolClause: "Lenis eases this scroller and reports the position to ScrollTrigger on the shared ticker.",
    examples: ["https://lenis.darkroom.engineering", "https://pangrampangram.com"],
    minLevel: 3,
    mount: (el) => mountFrom(() => import("./previews/lenis-smooth.ts"), el),
  },
  {
    id: "text-split",
    researchIds: ["B1", "B2", "B3", "B4"],
    label: "Headline split",
    tool: "gsap",
    toolClause: "GSAP SplitText raises the headline one word at a time.",
    examples: ["https://synchronized.studio/", "https://pangrampangram.com"],
    minLevel: 3,
    mount: (el) => mountFrom(() => import("./previews/split-text.ts"), el),
  },
  {
    id: "scroll-sequence",
    researchIds: ["A3", "A4", "A6", "A7", "C1", "C2", "C3", "D1", "D6"],
    label: "Pinned scroll sequence",
    tool: "gsap",
    toolClause: "GSAP ScrollTrigger scrubs a pinned sequence inside this frame.",
    examples: ["https://www.apple.com/airpods-pro/", "https://www.chungiyoo.com/"],
    minLevel: 5,
    mount: (el) => mountFrom(() => import("./previews/gsap-scroll.ts"), el),
  },
  {
    id: "svg-stagger",
    researchIds: ["E1", "E2", "E3", "E4", "E5"],
    label: "Drawn mark",
    tool: "anime",
    toolClause: "anime.js staggers the strokes of this mark.",
    examples: ["https://animejs.com/"],
    minLevel: 5,
    mount: (el) => mountFrom(() => import("./previews/anime-stagger.ts"), el),
  },
  {
    id: "shader",
    researchIds: ["F1", "B5", "D3", "G3"],
    label: "Shader grain",
    tool: "ogl",
    toolClause: "OGL runs a noise shader in this single WebGL context.",
    examples: ["https://lusion.co/", "https://darkroom.engineering"],
    minLevel: 6,
    mount: (el) => mountFrom(() => import("./previews/shader-ogl.ts"), el),
  },
  {
    id: "three-hero",
    researchIds: ["A8", "F2", "F3", "F4", "F5", "F6", "F7", "G1", "G2"],
    label: "3D hero",
    tool: "three",
    toolClause: "Three.js draws one small object in the single WebGL context.",
    examples: ["https://www.opalcamera.com/opal-tadpole", "https://www.igloo.inc/"],
    minLevel: 8,
    mount: (el) => mountFrom(() => import("./previews/three-hero.ts"), el),
  },
  {
    id: "cinematic",
    researchIds: ["C4"],
    label: "Cinematic timeline",
    tool: "theatre",
    toolClause: "Theatre core plays a checked-in timeline on the shared ticker.",
    examples: ["https://www.theatrejs.com/", "https://lusion.co/"],
    minLevel: 9,
    mount: (el) => mountFrom(() => import("./previews/theatre-sequence.ts"), el),
  },
];

export function familiesForLevel(level: number): MotionFamily[] {
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    throw new Error("Appetite level must be a whole number from 1 to 10.");
  }
  return families.filter((family) => family.minLevel <= level);
}

export { weightCeiling };
