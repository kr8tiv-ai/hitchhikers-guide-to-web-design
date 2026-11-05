/**
 * Motion recipes. Import this entry from site code.
 * The package root stays free of gsap so the engine can read the map.
 */
export { MOTION_COMPOSE_RULE } from "./compose-rule.ts";
export { motionHandle } from "./handle.ts";
export { bindAstroBeforeSwap } from "./swap.ts";
export { motionSetup } from "./setup.ts";
export { createPinnedTimeline } from "./pinned-timeline.ts";
export type { PinnedBeat, PinnedLabel, PinnedTimelineOptions } from "./pinned-timeline.ts";
export { createHorizontalTrack } from "./horizontal-track.ts";
export type { HorizontalTrackOptions } from "./horizontal-track.ts";
export { createKineticType } from "./kinetic-type.ts";
export type { KineticTypeOptions } from "./kinetic-type.ts";
export { createScrollCamera, sampleCamera } from "./scroll-camera.ts";
export type { ScrollCameraHandle, ScrollCameraOptions } from "./scroll-camera.ts";
export { createPreloaderHandoff } from "./preloader-handoff.ts";
export type { PreloaderHandle, PreloaderHandoffOptions } from "./preloader-handoff.ts";
export { createFrameSequence, snapFrameProgress } from "./frame-sequence.ts";
export type { FrameSequenceOptions } from "./frame-sequence.ts";
export { createPageTransition } from "./page-transition.ts";
export type { PageTransitionHandle, PageTransitionOptions } from "./page-transition.ts";
export { createBatchReveal } from "./batch-reveal.ts";
export type { BatchRevealOptions } from "./batch-reveal.ts";
export { createParallaxLayers, PARALLAX_TRAVEL_CAP } from "./parallax-layers.ts";
export type { ParallaxLayer, ParallaxLayersOptions } from "./parallax-layers.ts";
export { createSnapToLabels } from "./snap-to-labels.ts";
export type { SnapLabel, SnapToLabelsOptions } from "./snap-to-labels.ts";
export { createMicroInteractions } from "./micro-interactions.ts";
export type { MicroInteractionsOptions } from "./micro-interactions.ts";
export { isTaxonomyLetter, recipesFor, signatureRecipeCandidates } from "./world-map.ts";
export type { RecipeMapEntry, RecipeMapQuery, TaxonomyId, TaxonomyLetter } from "./world-map.ts";
export type { CameraKeyframe, CameraSample, KineticUnit, MotionHandle, RecipeName } from "./types.ts";

export {
  mountHoverLift,
  mountHorizontal,
  mountLenis,
  mountMarquee,
  mountParallax,
  mountReveal,
  mountSplitLine,
} from "../recipes/index.ts";
