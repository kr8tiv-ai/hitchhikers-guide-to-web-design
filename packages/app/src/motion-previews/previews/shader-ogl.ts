/// <reference lib="dom" />

import {
  claimWebgl,
  ensureSharedTicker,
  markLive,
  onSharedTick,
  paintStill,
  releaseWebgl,
  runWhenVisible,
} from "../slider.ts";

const WEBGL_ID = "shader";

const VERTEX = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform float uTime;
void main() {
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 12.0, vec2(12.9898, 78.233))) * 43758.5453);
  float band = 0.5 + 0.5 * sin(gl_FragCoord.y * 0.06 + uTime * 1.6);
  vec3 ink = vec3(0.11, 0.09, 0.08);
  vec3 rust = vec3(0.56, 0.18, 0.10);
  vec3 paper = vec3(0.95, 0.92, 0.87);
  vec3 color = mix(ink, mix(rust, paper, band), 0.45 + n * 0.55);
  gl_FragColor = vec4(color, 1.0);
}
`;

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    if (!claimWebgl(WEBGL_ID)) {
      paintStill(el, "Another WebGL preview is live.");
      return () => undefined;
    }
    await ensureSharedTicker();
    try {
      const ogl = await import("ogl");
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const renderer = new ogl.Renderer({ dpr, alpha: false, antialias: false });
      const gl = renderer.gl;
      const canvas = gl.canvas;
      canvas.className = "hh-motion__gl";
      el.replaceChildren(canvas);
      const width = Math.max(320, el.clientWidth);
      const height = Math.max(200, el.clientHeight);
      renderer.setSize(width, height);
      const geometry = new ogl.Triangle(gl);
      const program = new ogl.Program(gl, {
        vertex: VERTEX,
        fragment: FRAGMENT,
        uniforms: { uTime: { value: 0 } },
      });
      const mesh = new ogl.Mesh(gl, { geometry, program });
      markLive(el);
      el.dataset.webglLive = "true";
      const off = onSharedTick((time) => {
        program.uniforms.uTime.value = time;
        renderer.render({ scene: mesh });
      });
      return () => {
        off();
        el.dataset.webglLive = "false";
        const lose = gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
        releaseWebgl(WEBGL_ID);
      };
    } catch {
      releaseWebgl(WEBGL_ID);
      paintStill(el, "WebGL is not available on this machine.");
      return () => undefined;
    }
  });
}
