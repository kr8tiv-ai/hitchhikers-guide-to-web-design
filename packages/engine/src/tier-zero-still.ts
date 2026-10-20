/**
 * Tier-0 still shared by the reduced-motion pass and the WebGL tier-0 path.
 * The still uses the same camera, grade, and lighting as the scene.
 * prefers-reduced-motion is the switch. Viewport width does not select it.
 */

export const OPACITY_KEEP_MS = 200;

export const OPACITY_KEEP_NOTE =
  "Opacity changes at or under 200 ms may stay. The 200 ms figure is a studio heuristic lined up with the INP good threshold.";

const POSE_EPSILON = 1e-6;

const UNART_DIRECTED = /blank|placeholder|label|todo/i;

export interface TierZeroCamera {
  fov: number;
  position: readonly [number, number, number];
  lookAt: readonly [number, number, number];
}

export interface TierZeroGrade {
  name: string;
  exposure: number;
}

export interface TierZeroLighting {
  key: string;
}

export interface TierZeroStill {
  camera: TierZeroCamera;
  grade: TierZeroGrade;
  lighting: TierZeroLighting;
}

export interface MotionClass {
  reduced: boolean;
  widthSelectsStill: boolean;
}

export function posesMatch(scene: TierZeroStill, still: TierZeroStill, epsilon = POSE_EPSILON): boolean {
  return (
    close(scene.camera.fov, still.camera.fov, epsilon) &&
    vecClose(scene.camera.position, still.camera.position, epsilon) &&
    vecClose(scene.camera.lookAt, still.camera.lookAt, epsilon) &&
    scene.grade.name === still.grade.name &&
    close(scene.grade.exposure, still.grade.exposure, epsilon) &&
    scene.lighting.key === still.lighting.key
  );
}

export function stillIsArtDirected(still: TierZeroStill): boolean {
  if (!Number.isFinite(still.camera.fov) || still.camera.fov <= 0) return false;
  if (!vecFinite(still.camera.position) || !vecFinite(still.camera.lookAt)) return false;
  if (!namedGrade(still.grade.name) || !Number.isFinite(still.grade.exposure)) return false;
  if (!namedGrade(still.lighting.key)) return false;
  return true;
}

export function classifyMotion(input: { prefersReducedMotion: boolean; viewportWidth: number }): MotionClass {
  if (!Number.isFinite(input.viewportWidth)) {
    return { reduced: input.prefersReducedMotion, widthSelectsStill: false };
  }
  return { reduced: input.prefersReducedMotion, widthSelectsStill: false };
}

function namedGrade(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !UNART_DIRECTED.test(trimmed);
}

function close(left: number, right: number, epsilon: number): boolean {
  return Math.abs(left - right) <= epsilon;
}

function vecFinite(vec: readonly [number, number, number]): boolean {
  return vec.every((value) => Number.isFinite(value));
}

function vecClose(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
  epsilon: number,
): boolean {
  return left.every((value, index) => {
    const other = right[index];
    return other !== undefined && close(value, other, epsilon);
  });
}
