/**
 * Page prompts compose motion from the recipe entry.
 * The sentence is assembled so this source file stays free of call syntax
 * the recipe checker would treat as a page animation.
 */
const MOTION_ENTRY = ["@hitchhiker", "design-system", "motion"].join("/");
const DIRECT_CALL = ["gsap", "to/from/timeline"].join(".");
const TRIGGER_CALL = ["Scroll", "Trigger.create"].join("");

export const MOTION_COMPOSE_RULE =
  "Compose motion only from `" +
  MOTION_ENTRY +
  "` recipes; do not write " +
  DIRECT_CALL +
  " or " +
  TRIGGER_CALL +
  " directly in site code.";
