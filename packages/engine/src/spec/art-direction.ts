/**
 * Deterministic art-direction draft. No model call.
 * Owner words become a starting vocabulary. Grok refines it and may
 * choose a better technique when the brand and the gates allow it.
 * A motion score sets intensity and a performance-cost ceiling.
 * It never means the absence of motion.
 */

import { headingPhrase, headingWish, typeLead, winsSentence } from "../brand/type-conflict.ts";
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

/** A picked direction. Used where the brief is silent. */
export interface ArtPick {
  display: string;
  body: string;
  hue?: string;
  name?: string;
}

export interface ArtDirection {
  styleWorld: StyleWorld;
  /** Words printed on the Style world line. The enum stays on styleWorld. */
  styleWords: string;
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

function finishSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim().replace(/[;,:]+$/, "").trim();
  if (trimmed === "") return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Shorten at a sentence or clause end. A single long token is kept whole. */
function clip(text: string, max = 220): string {
  const cleaned = text.replace(/[!！\u2014]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned === "") return "";
  if (cleaned.length <= max) return finishSentence(cleaned);
  const window = cleaned.slice(0, max);
  let end = -1;
  for (let index = 0; index < window.length; index += 1) {
    const ch = window[index];
    if (ch === "." || ch === "?" || ch === ";") end = index + 1;
  }
  if (end > 0) return finishSentence(cleaned.slice(0, end));
  const comma = window.lastIndexOf(",");
  if (comma > 0) return finishSentence(cleaned.slice(0, comma));
  const space = window.lastIndexOf(" ");
  if (space > 0) return finishSentence(cleaned.slice(0, space));
  return finishSentence(cleaned);
}

function answerValue(answers: readonly ArtAnswer[], id: string): string {
  const found = answers.find((answer) => answer.id === id);
  if (found === undefined) return "";
  if (found.status !== undefined && SKIPPED.has(found.status)) return "";
  return found.value.replace(/\s+/g, " ").trim();
}

function isSourcingSentence(sentence: string): boolean {
  return (
    /\b(?:stock|open-license|open license|my own|ai stills|fill gaps|dollars|budget|no video)\b/i.test(sentence) ||
    /^a mix:/i.test(sentence)
  );
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

function typeVoiceFor(world: StyleWorld, text: string, typeText: string, pick?: ArtPick): string {
  const choice = typeChoiceFor(text);
  const display = pick?.display.trim() || choice.families[0] || "";
  const bodyName = pick?.body.trim() || choice.families[1] || display;
  const families = familiesSentence(bodyName === display ? [display] : [display, bodyName]);
  const wish = headingWish(typeText);
  const owner = typeLead(typeText);
  let lead: string;
  if ((wish === "sans" || wish === "serif") && owner !== "") lead = finishSentence(owner);
  else if (world === "3d-world") lead = "A geometric sans display.";
  else if (world === "playful") lead = "A rounded display with an easy reading size.";
  else if (world === "brutalist") lead = "A raw grotesque display.";
  else lead = "A large serif display scale, with generous whitespace.";
  const voice = `${lead} The exact scale is yours to set. ${families}`;
  const wins = winsSentence(display, bodyName, typeText);
  return wins === "" ? voice : `${voice} ${wins}`;
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

function layoutFor(world: StyleWorld, sectionId: string, typeText: string): string {
  if (world === "3d-world") return "A full-bleed technical frame. You choose whether this section is an island.";
  if (world === "playful") return "A bright rhythmic layout with clear groups.";
  if (world === "brutalist") return "A hard grid with raw type and little decoration.";
  if (sectionId === "hero" || sectionId.endsWith("-hero")) {
    if (headingWish(typeText) === "sans") {
      return `Generous whitespace, ${headingPhrase(typeText)} as a starting scale, and a quiet first frame.`;
    }
    return "Generous whitespace, a large serif display as a starting scale, and a quiet first frame.";
  }
  return "An editorial grid with generous whitespace and overlapping media where the story needs it.";
}

function mediaFor(world: StyleWorld, namedColours: boolean): string {
  const grade = world === "editorial" && !namedColours ? "the warm film grade" : "the shared grade";
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

function firstLovePhrase(text: string): string {
  const match = /:\s*love\.\s*([^.]*)/i.exec(text);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function firstPictureSentence(text: string): string {
  for (const part of text.split(/(?<=[.!?])\s+/)) {
    const sentence = part.replace(/\s+/g, " ").trim();
    if (sentence === "" || isSourcingSentence(sentence)) continue;
    return sentence.replace(/[.!?]+$/, "").trim();
  }
  return "";
}

function colourText(brief: string, answers: readonly ArtAnswer[]): string {
  const fromBrief =
    sectionBody(brief, "Colours") ||
    sectionBody(brief, "Colour") ||
    sectionBody(brief, "Colors") ||
    sectionBody(brief, "Color");
  if (fromBrief !== "") return fromBrief;
  return answerValue(answers, "DP-1.2");
}

function typeTextOf(brief: string, answers: readonly ArtAnswer[]): string {
  const fromBrief = sectionBody(brief, "Type") || sectionBody(brief, "Typography");
  if (fromBrief !== "") return fromBrief;
  return answerValue(answers, "DP-1.5");
}

function styleWordsFor(
  brief: string,
  answers: readonly ArtAnswer[],
  world: StyleWorld,
  pick?: ArtPick,
): string {
  const references = sectionBody(brief, "References") || answerValue(answers, "DP-5.1");
  const loved = firstLovePhrase(references);
  if (loved !== "") return loved;
  const imagery = sectionBody(brief, "Imagery") || answerValue(answers, "DP-5.6");
  const picture = firstPictureSentence(imagery);
  if (picture !== "") return picture;
  const name = pick?.name?.replace(/\s+/g, " ").trim() ?? "";
  if (name !== "") return name;
  return world;
}

function lightText(brief: string, answers: readonly ArtAnswer[], world: StyleWorld): string {
  const fromAnswer = answerValue(answers, "DP-5.5");
  if (fromAnswer !== "") return finishSentence(fromAnswer);
  const fromBrief = sectionBody(brief, "Light");
  if (fromBrief !== "") return clip(fromBrief, 180);
  return lightFor(world).light;
}

function gradeText(brief: string, answers: readonly ArtAnswer[], world: StyleWorld, pick?: ArtPick): string {
  const colours = colourText(brief, answers);
  if (colours !== "") return clip(colours, 220);
  const hue = pick?.hue?.trim() ?? "";
  if (hue !== "") return `Hue ${hue}.`;
  return lightFor(world).colorGrade;
}

export function translateBrief(
  brief: string,
  answers: readonly ArtAnswer[] = [],
  sections: readonly string[] = [],
  pick?: ArtPick,
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
  const typeText = typeTextOf(brief, answers);
  const namedColours = colourText(brief, answers) !== "";
  const signatureHero = signatureFor(styleWorld, motion, heroParallax);
  const reveals = revealsFor(motion, cards);
  const moodSource = clip(vibe, 160);
  const imagerySource = clip(sectionBody(brief, "Imagery"), 180);
  const seen = new Set<string>();
  const sectionArts: SectionArt[] = [];
  for (const sectionId of sections) {
    const id = sectionId.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    const transition = transitionsFor(motion);
    sectionArts.push({
      sectionId: id,
      layout: layoutFor(styleWorld, id, typeText),
      media: mediaFor(styleWorld, namedColours),
      motion: sectionMotion(id, signatureHero, reveals, cards),
      transitionIn: transition.transitionIn,
      transitionOut: transition.transitionOut,
    });
  }
  const imagery = imagerySource === ""
    ? mediaFor(styleWorld, namedColours)
    : clip(
        `${imagerySource} Generated pictures are concept art. A real person, place, product, or listing is never generated.`,
        320,
      );
  return {
    styleWorld,
    styleWords: styleWordsFor(brief, answers, styleWorld, pick),
    concept: conceptFor(styleWorld),
    mood: moodSource === "" ? conceptFor(styleWorld) : moodSource,
    light: lightText(brief, answers, styleWorld),
    colorGrade: gradeText(brief, answers, styleWorld, pick),
    typeVoice: typeVoiceFor(styleWorld, corpus, typeText, pick),
    motionCharacter: characterFor(styleWorld, motion),
    signatureHero,
    scroll: scrollFor(styleWorld, motion),
    reveals,
    imagery,
    palette: clip(sectionBody(brief, "Colours"), 220),
    logo: clip(sectionBody(brief, "Logo"), 180),
    motionNote: `Motion score ${motion.score} is a starting point. Intensity is ${motion.intensity}. Performance-cost ceiling is ${motion.performanceCost}. A score never means the absence of motion.`,
    motion,
    sections: sectionArts,
    freedom: [...ART_FREEDOM],
  };
}

export function directionAcceptance(art: ArtDirection): string[] {
  return [
    `Style world: ${art.styleWords}`,
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
  ]
    .map((line) => finishSentence(line))
    .filter((line) => line.trim() !== "");
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
