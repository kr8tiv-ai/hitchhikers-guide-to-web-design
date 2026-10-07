/**
 * Review widths from Zaphod (v2 §11.3) and Mostly Harmless (v2 §12).
 * 375 is the phone width. 1920 is the wide width. Do not drop either.
 */
export const REVIEW_WIDTHS: readonly [375, 768, 1440, 1920] = [375, 768, 1440, 1920];

/**
 * Calls `openPage` once per review width, in order, and returns the buffers
 * keyed by width. Those keys are the width list a report compares with
 * `REVIEW_WIDTHS` to name a gap. An empty buffer or a thrown opener fails
 * that width and stops. Later widths are not requested.
 *
 * The injected opener owns the shot for that width: full page, above the
 * fold, and a short scroll strip for sections MOTION.md marks as motion-led.
 * The Playwright opener is wired later. This module does not launch a
 * browser, read pixels, or compare baselines.
 *
 * Callers that record an environment pass Node `os.platform()` strings into
 * the visual policy. This function does not read the operating system.
 */
export async function captureAll(
  openPage: (width: number) => Promise<Buffer>,
): Promise<Record<number, Buffer>> {
  const shots: Record<number, Buffer> = {};
  for (const width of REVIEW_WIDTHS) {
    let buffer: Buffer;
    try {
      buffer = await openPage(width);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      throw new Error(
        `Screenshot capture failed at width ${width}: ${detail}`,
        caught instanceof Error ? { cause: caught } : undefined,
      );
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error(`Empty screenshot buffer at width ${width}`);
    }
    shots[width] = buffer;
  }
  return shots;
}
