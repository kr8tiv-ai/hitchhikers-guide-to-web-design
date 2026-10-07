/**
 * OGL shader on the shared WebGL2 context.
 * Use this when the page does not already mount Three.
 * The clock is gsap.ticker.
 */

import { prefersReducedMotion } from "../motion.ts";
import { getContext, pauseOffscreen, readPowerSignals, shouldUsePoster, showPoster } from "../webgl.ts";

const VERT = "attribute vec2 position; void main(){ gl_Position = vec4(position, 0.0, 1.0); }";
const FRAG = "precision highp float; uniform float uTime; void main(){ float shade = 0.45 + 0.15 * sin(uTime); gl_FragColor = vec4(shade, 0.32, 0.18, 1.0); }";

interface TickerLike {
  add: (fn: (time: number) => void) => void;
  remove: (fn: (time: number) => void) => void;
}

interface OglRenderer {
  gl: WebGL2RenderingContext;
  render: (options: { scene: unknown; camera: unknown }) => void;
}

interface OglModule {
  Renderer: new (options: {
    canvas: HTMLCanvasElement;
    context: WebGL2RenderingContext;
    webgl: 2;
    alpha: boolean;
    dpr: number;
  }) => OglRenderer;
  Camera: new (gl: WebGL2RenderingContext) => { position: { z: number } };
  Geometry: new (gl: WebGL2RenderingContext, attributes: unknown) => unknown;
  Program: new (gl: WebGL2RenderingContext, options: unknown) => { uniforms: { uTime: { value: number } } };
  Mesh: new (gl: WebGL2RenderingContext, options: unknown) => unknown;
}

export async function mountShader(canvas: HTMLCanvasElement, poster: HTMLElement): Promise<() => void> {
  const signals = readPowerSignals();
  if (prefersReducedMotion() || shouldUsePoster(signals)) {
    showPoster(poster, "Still.");
    return () => {};
  }
  const gl = getContext(canvas);
  const ogl = (await import("ogl")) as unknown as OglModule;
  const gsapMod = (await import("gsap")) as unknown as { default: { ticker: TickerLike } };
  const renderer = new ogl.Renderer({
    canvas,
    context: gl,
    webgl: 2,
    alpha: true,
    dpr: Math.min(window.devicePixelRatio, 2),
  });
  const camera = new ogl.Camera(renderer.gl);
  camera.position.z = 1;
  const geometry = new ogl.Geometry(renderer.gl, {
    position: { size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3]) },
  });
  const program = new ogl.Program(renderer.gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: { uTime: { value: 0 } },
  });
  const mesh = new ogl.Mesh(renderer.gl, { geometry, program });
  let running = true;
  const tick = (time: number): void => {
    if (!running) return;
    program.uniforms.uTime.value = time;
    renderer.render({ scene: mesh, camera });
  };
  gsapMod.default.ticker.add(tick);
  const stopWatch = pauseOffscreen(canvas, (state) => {
    running = state === "resume";
  });
  return () => {
    running = false;
    stopWatch();
    gsapMod.default.ticker.remove(tick);
  };
}
