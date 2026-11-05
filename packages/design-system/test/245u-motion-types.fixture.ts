/**
 * Compile fixture for 245u. The test typechecks this file.
 * It is not executed, so the gsap ambient module is enough.
 */
import {
  MOTION_COMPOSE_RULE,
  PARALLAX_TRAVEL_CAP,
  bindAstroBeforeSwap,
  createBatchReveal,
  createFrameSequence,
  createHorizontalTrack,
  createKineticType,
  createMicroInteractions,
  createPageTransition,
  createParallaxLayers,
  createPinnedTimeline,
  createPreloaderHandoff,
  createScrollCamera,
  createSnapToLabels,
  motionSetup,
  recipesFor,
  sampleCamera,
  signatureRecipeCandidates,
  snapFrameProgress,
  type BatchRevealOptions,
  type FrameSequenceOptions,
  type HorizontalTrackOptions,
  type KineticTypeOptions,
  type MicroInteractionsOptions,
  type PageTransitionOptions,
  type ParallaxLayersOptions,
  type PinnedTimelineOptions,
  type PreloaderHandoffOptions,
  type ScrollCameraOptions,
  type SnapToLabelsOptions,
} from "../src/motion/index.ts";
import type { CameraKeyframe, MotionHandle, RecipeName } from "../src/motion/types.ts";

const target: object = {};

const pinnedOptions: PinnedTimelineOptions = {
  end: "+=150%",
  scrub: 1,
  start: "top top",
  beats: [{ target, vars: { yPercent: 24, opacity: 0, duration: 0.9, ease: "expo.out" }, at: 0, label: "rise" }],
  labels: [{ name: "hold", at: 0.5 }],
};

const horizontalOptions: HorizontalTrackOptions = { scrub: 1, start: "top top", panels: [target] };
const kineticOptions: KineticTypeOptions = { unit: "word", scrub: false, start: "top 80%" };
const keyframes: readonly CameraKeyframe[] = [
  { at: 0, position: { x: 0, y: 1, z: 4 }, lookAt: { x: 0, y: 0, z: 0 } },
  { at: 1, position: { x: 1, y: 1, z: 2 }, lookAt: { x: 0, y: 0, z: 0 } },
];
const cameraOptions: ScrollCameraOptions = { keyframes, end: "+=200%", scrub: 1, start: "top top" };
const preloaderOptions: PreloaderHandoffOptions = { duration: 0.9 };
const frameOptions: FrameSequenceOptions = { frames: ["/frame-0.webp"], end: "+=200%", scrub: true };
const pageOptions: PageTransitionOptions = { duration: 0.6 };
const batchOptions: BatchRevealOptions = { start: "top 85%", yPercent: 16, stagger: 0.08 };
const parallaxOptions: ParallaxLayersOptions = { travel: 8, layers: [{ target, travel: 6 }] };
const snapOptions: SnapToLabelsOptions = { end: "+=150%", scrub: 1, labels: [{ name: "start", at: 0 }] };
const microOptions: MicroInteractionsOptions = { magnetic: true, magneticTarget: target, media: target, cursor: true };

function needsHandle(handle: MotionHandle): MotionHandle {
  handle.refresh();
  const reduced: boolean = handle.reduced;
  if (reduced) handle.kill();
  return handle;
}

const pin = needsHandle(createPinnedTimeline(target, pinnedOptions));
const track = needsHandle(createHorizontalTrack(target, horizontalOptions));
const kinetic = needsHandle(createKineticType(target, kineticOptions));
const camera = createScrollCamera(target, cameraOptions);
const intro = createPreloaderHandoff(target, preloaderOptions);
const frames = needsHandle(createFrameSequence(target, frameOptions));
const transition = createPageTransition(target, pageOptions);
const batch = needsHandle(createBatchReveal(target, batchOptions));
const layers = needsHandle(createParallaxLayers(target, parallaxOptions));
const snap = needsHandle(createSnapToLabels(target, snapOptions));
const micro = needsHandle(createMicroInteractions(target, microOptions));
const scroll = needsHandle(motionSetup());

const names: readonly RecipeName[] = signatureRecipeCandidates("editorial", 6);
const mapped = recipesFor({ world: "3d-world", appetite: 9, taxonomy: ["A", "F"] });
const sample = camera.sample();
const midway = sampleCamera(keyframes, 0.5);
const progress: number = camera.progress.value;
const ready: Promise<void> = intro.ready;
const snapped: number = snapFrameProgress(0.14, 10);
const unbind = bindAstroBeforeSwap([pin, track, kinetic, camera, intro, frames, batch, layers, snap, micro, scroll]);

void transition.go(() => undefined);
void sample.lookAt.z;
void midway.x;
void progress;
void ready;
void snapped;
void names[0];
void mapped[0]?.cite;
void MOTION_COMPOSE_RULE.length;
void PARALLAX_TRAVEL_CAP;
unbind();

const brokenUnit: KineticTypeOptions = {
  // @ts-expect-error kinetic unit is line, word, or char
  unit: "sentence",
};
void brokenUnit;

createBatchReveal(target, {
  // @ts-expect-error batch options do not take a layout width
  width: 12,
});
