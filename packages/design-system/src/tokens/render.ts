import type { WorldTokens } from "./types.ts";

/** Tokens section body. No leading or trailing newline, so DESIGN.md can trim to this. */
export function renderTokensSection(tokens: WorldTokens): string {
  return [
    `World: ${tokens.world}.`,
    `Display family: ${tokens.font.display}. Body family: ${tokens.font.body}.`,
    `Color tokens: ${tokens.colorLine}.`,
    `Paper ${tokens.color.paper}. Ink ${tokens.color.ink}. Accent ${tokens.color.accent}. Muted ${tokens.color.muted}. Surface ${tokens.color.surface}.`,
    "Type:",
    ...tokens.type.steps.map((step) => `- ${step.name}: ${step.clamp}`),
    "Space:",
    ...tokens.spacing.map((step) => `- ${step.name}: ${step.value}`),
    "Radii:",
    ...tokens.radii.map((step) => `- ${step.name}: ${step.value}`),
    "Motion durations:",
    `- reveal: ${tokens.motion.durations.reveal}`,
    `- hover: ${tokens.motion.durations.hover}`,
    `- stagger: ${tokens.motion.durations.stagger}`,
    "Motion easings:",
    `- reveal: ${tokens.motion.easings.reveal}`,
    `- hover: ${tokens.motion.easings.hover}`,
    `- track: ${tokens.motion.easings.track}`,
    "Motion tokens live in src/scripts/motion.ts.",
  ].join("\n");
}
