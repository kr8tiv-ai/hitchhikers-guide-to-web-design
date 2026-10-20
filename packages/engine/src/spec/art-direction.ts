/**
 * Deterministic art-direction draft. No model call.
 * Owner words become a starting vocabulary. Grok refines it and may
 * choose a better technique when the brand and the gates allow it.
 * A motion score sets intensity and a performance-cost ceiling.
 * It never means the absence of motion.
 */

import { familiesSentence, typeChoiceFor } from "../brand/type-scale.ts";

export type StyleWorld = "editorial" | "3d-world" | "playful" | "brutalist";

export interface ArtAnswer {
  id?: string;
  value: string;
  status?: string;
}

export interface ArtMotion {
  score: number;
  intensity: "quiet" | "measured" | "cinematic";
  performanceCost: "low" | "medium" | "high";
  techniques: string[];
}

export interface SectionArt {
  sectionId: string;
  layout: string;
  media: string;
  motion: string;
  transitionIn: string;
  transitionOut: string;
}

export interface ArtDirection {
  styleWorld: StyleWorld;
  concept: string;
  mood: string;
  light: string;
  colorGrade: string;
  typeVoice: string;
  motionCharacter: string;
  signatureHero: string;
  scroll: string;
  reveals: string;
  imagery: string;
  palette: string;
  logo: string;
  motionNote: string;
  motion: ArtMotion;
  sections: SectionArt[];
  freedom: string[];
}

const SKIPPED = new Set(["SKIPPED", "NOT_APPLICABLE", "UNANSWERED"]);

export const ART_FREEDOM: readonly string[] = [
  "These are starting points. Choose a better technique if it serves the brand and passes reduced motion, contrast, and the performance budget.",
  "You pick island boundaries, the exact libraries, and the type scale.",
  "Add one creative idea of your own beyond this mapping so two briefs never get the same page.",
];

export const ART_GUIDANCE: readonly string[] = [
  ...ART_FREEDOM,
  "A motion score sets intensity and a performance-cost ceiling. It never means the absence of motion.",
];

function withoutNegations(text: string): string {
  return text.replace(/\b(?:never|not|no|without)\b[^.]{0,120}/gi, " ");
}

export function styleWorldFrom(text: string): StyleWorld {
  const lower = withoutNegations(text).toLowerCase();
  if (lower.includes("brutal")) return "brutalist";
  if (/playful|sunny|loud|retail/.test(lower)) return "playful";
  if (/bold|tech|shader|webgl/.test(lower)) return "3d-world";
  if (/\bdark\b/.test(lower) && !/kinfolk|editorial|serif|aesop|patagonia/.test(lower)) {
    return "3d-world";
  }
  return "editorial";
}

function sectionBody(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function plain(text: string, max = 220): string {
  return text
    .replace(/[!！\u2014]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function corpusOf(brief: string, answers: readonly ArtAnswer[]): string {
  const parts = [brief];
  for (const answer of answers) {
    if (answer.status !== undefined && SKIPPED.has(answer.status)) continue;
    const value = answer.value.trim();
    if (value !== "") parts.push(value);
  }
  return parts.join("\n");
}

function readScore(text: string, world: StyleWorld): number {
  const match = /motion score(?:\s+is)?\s*[:=]?\s*(\d{1,2})\b/i.exec(text);
  if (match?.[1] !== undefined) {
    const score = Number(match[1]);
    if (score >= 10) return 10;
    if (score >= 1) return score;
  }
  if (world === "3d-world") return 8;
  if (world === "playful" || world === "brutalist") return 5;
  return 4;
}

function motionBand(score: number): ArtMotion {
  if (score <= 3) {
    return {
      score,
      intensity: "quiet",
      performanceCost: "low",
      techniques: [
        "CSS scroll-driven reveals",
        "Astro ClientRouter or View Transitions",
        "a designed hero",
      ],
    };
  }
  if (score <= 6) {
    return {
      score,
      intensity: "measured",
      performanceCost: "medium",
      techniques: [
        "GSAP with ScrollTrigger, SplitText on headlines, and timelines",
        "Lenis or native smooth scroll",
        "layered parallax",
        "staggered reveals",
      ],
    };
  }
  return {
    score,
    intensity: "cinematic",
    performanceCost: "high",
    techniques: [
      "pinned scroll stories",
      "shaders",
      "a Three.js or React Three Fiber island (client:visible) on the hero",
    ],
  };
}

function conceptFor(world: StyleWorld): string {
  if (world === "3d-world") return "One visual concept: a bold dark technical world with a precise hero.";
  if (world === "playful") return "One visual concept: a bright playful world with a clear rhythm.";
  if (world === "brutalist") return "One visual concept: a raw brutalist frame with hard type.";
  return "One visual concept: a slow editorial visit, calm and warm, with generous whitespace.";
}

function typeVoiceFor(world: StyleWorld, text: string): string {
  const families = familiesSentence(typeChoiceFor(text).families);
  if (world === "3d-world") return `A geometric sans display. The exact scale is yours to set. ${families}`;
  if (world === "playful") return `A rounded display with an easy reading size. The exact scale is yours to set. ${families}`;
  if (world === "brutalist") return `A raw grotesque display. The exact scale is yours to set. ${families}`;
  return `A large serif display scale, with generous whitespace. The exact scale is yours to set. ${families}`;
}

function lightFor(world: StyleWorld): { light: string; colorGrade: string } {
  if (world === "3d-world") return { light: "Hard directional light.", colorGrade: "A cool dark grade." };
  if (world === "playful") return { light: "Open daylight.", colorGrade: "A clean bright grade." };
  if (world === "brutalist") return { light: "Flat hard light.", colorGrade: "An ungraded, high-contrast print." };
  return { light: "Soft window light.", colorGrade: "A warm film grade." };
}

function scrollFor(world: StyleWorld, motion: ArtMotion): string {
  if (world === "editorial" && motion.score >= 4 && motion.score <= 6) return "A slow Lenis scroll.";
  if (motion.score <= 3) return "CSS scroll-driven reveals, with Astro ClientRouter or View Transitions.";
  if (motion.score >= 7) return "Pinned scroll stories, with one scroll owner on the page.";
  return "Lenis or native smooth scroll, with one scroll owner on the page.";
}

function signatureFor(world: StyleWorld, motion: ArtMotion, heroParallax: boolean): string {
  if (heroParallax || (world === "editorial" && motion.score >= 4 && motion.score <= 6)) {
    return "Soft parallax on the hero.";
  }
  if (motion.score >= 7) return "A signature hero island. You choose the boundary and the library.";
  return "A designed hero with a clear first frame.";
}

function revealsFor(motion: ArtMotion, cards: boolean): string {
  if (cards) return "Staggered card reveals at about 400 ms.";
  if (motion.score >= 4 && motion.score <= 6) return "Staggered fade-and-rise reveals at about 400 ms.";
  if (motion.score >= 7) return "Reveals tied to the pinned story.";
  return "CSS scroll-driven reveals.";
}

function characterFor(world: StyleWorld, motion: ArtMotion): string {
  if (motion.intensity === "quiet") return "Quiet motion. The page still has a designed hero.";
  if (world === "editorial") return "Slow and unhurried, with staggered reveals.";
  if (world === "3d-world") return "Precise and cinematic.";
  if (world === "playful") return "Light and rhythmic.";
  return "Hard cuts and direct moves.";
}

function layoutFor(world: StyleWorld, sectionId: string): string {
  if (world === "3d-world") return "A full-bleed technical frame. You choose whether this section is an island.";
  if (world === "playful") return "A bright rhythmic layout with clear groups.";
  if (world === "brutalist") return "A hard grid with raw type and little decoration.";
  if (sectionId === "hero" || sectionId.endsWith("-hero")) {
    return "Generous whitespace, a large serif display as a starting scale, and a quiet first frame.";
  }
  return "An editorial grid with generous whitespace and overlapping media where the story needs it.";
}

function mediaFor(world: StyleWorld): string {
  const grade = world === "editorial" ? "the warm film grade" : "the shared grade";
  return `Layered media in ${grade}. Use the supplied image when it fits, otherwise the generated concept set. A real person, place, product, or listing is never generated.`;
}

function transitionsFor(motion: ArtMotion): { transitionIn: string; transitionOut: string } {
  if (motion.score >= 7) {
    return {
      transitionIn: "Enter on a pinned scroll beat or a view transition.",
      transitionOut: "Hand off to the next section with a view transition.",
    };
  }
  return {
    transitionIn: "Fade and rise into the section.",
    transitionOut: "A short crossfade into the next section.",
  };
}

function sectionMotion(sectionId: string, signature: string, reveals: string, cards: boolean): string {
  if (sectionId === "hero" || sectionId.endsWith("-hero")) return signature;
  if (cards && /farm|card|grid/.test(sectionId)) return "Staggered card reveals at about 400 ms.";
  return reveals;
}

export function translateBrief(
  brief: string,
  answers: readonly ArtAnswer[] = [],
  sections: readonly string[] = [],
): ArtDirection {
  const corpus = corpusOf(brief, answers);
  const vibe = sectionBody(brief, "Vibe");
  const references = sectionBody(brief, "References");
  const motionText = sectionBody(brief, "Motion");
  const worldSource = [vibe, references, motionText].filter((part) => part.trim() !== "").join("\n");
  const styleWorld = styleWorldFrom(worldSource.trim() === "" ? corpus : worldSource);
  const motion = motionBand(readScore(corpus, styleWorld));
  const cards = /\bcards?\b/i.test(corpus) && /fade|stagger|400/i.test(corpus);
  const heroParallax = /parallax/i.test(corpus) && /hero/i.test(corpus);
  const grade = lightFor(styleWorld);
  const signatureHero = signatureFor(styleWorld, motion, heroParallax);
  const reveals = revealsFor(motion, cards);
  const moodSource = plain(vibe, 160);
  const imagerySource = plain(sectionBody(brief, "Imagery"), 180);
  const seen = new Set<string>();
  const sectionArts: SectionArt[] = [];
  for (const sectionId of sections) {
    const id = sectionId.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    const transition = transitionsFor(motion);
    sectionArts.push({
      sectionId: id,
      layout: layoutFor(styleWorld, id),
      media: mediaFor(styleWorld),
      motion: sectionMotion(id, signatureHero, reveals, cards),
      transitionIn: transition.transitionIn,
      transitionOut: transition.transitionOut,
    });
  }
  const imagery = imagerySource === ""
    ? mediaFor(styleWorld)
    : `${imagerySource} Generated pictures are concept art. A real person, place, product, or listing is never generated.`;
  return {
    styleWorld,
    concept: conceptFor(styleWorld),
    mood: moodSource === "" ? conceptFor(styleWorld) : moodSource,
    light: grade.light,
    colorGrade: grade.colorGrade,
    typeVoice: typeVoiceFor(styleWorld, corpus),
    motionCharacter: characterFor(styleWorld, motion),
    signatureHero,
    scroll: scrollFor(styleWorld, motion),
    reveals,
    imagery: plain(imagery, 320),
    palette: plain(sectionBody(brief, "Colours"), 220),
    logo: plain(sectionBody(brief, "Logo"), 180),
    motionNote: `Motion score ${motion.score} is a starting point. Intensity is ${motion.intensity}. Performance-cost ceiling is ${motion.performanceCost}. A score never means the absence of motion.`,
    motion,
    sections: sectionArts,
    freedom: [...ART_FREEDOM],
  };
}

export function directionAcceptance(art: ArtDirection): string[] {
  return [
    `Style world: ${art.styleWorld}.`,
    `Concept: ${art.concept}`,
    `Mood: ${art.mood}`,
    `Light: ${art.light}`,
    `Color grade: ${art.colorGrade}`,
    `Type voice: ${art.typeVoice}`,
    `Motion character: ${art.motionCharacter}`,
    `Signature hero: ${art.signatureHero}`,
    `Scroll: ${art.scroll}`,
    `Reveals: ${art.reveals}`,
    `Imagery: ${art.imagery}`,
    art.palette === "" ? "" : `Colours: ${art.palette}`,
    art.logo === "" ? "" : `Logo: ${art.logo}`,
    art.motionNote,
    `Starting techniques: ${art.motion.techniques.join("; ")}.`,
    ...art.freedom,
  ].filter((line) => line.trim() !== "");
}

export function sectionAcceptance(section: SectionArt, art: ArtDirection): string[] {
  return [
    `Layout: ${section.layout}`,
    `Media: ${section.media}`,
    `Motion: ${section.motion}`,
    `Transition in: ${section.transitionIn}`,
    `Transition out: ${section.transitionOut}`,
    art.motionNote,
    ...art.freedom,
  ];
}
