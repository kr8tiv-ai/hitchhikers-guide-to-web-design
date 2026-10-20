/**
 * Lazy Three.js hero. The dynamic import keeps Three off the page until mount.
 * The renderer uses the shared WebGL2 context and the shared ticker.
 */

import { beginScene, bindContextLoss, capDpr, createContextGuard, pauseOffscreen, readPowerSignals, showArtDirectedStill, HERO_POSE, posterImageFrom } from "../webgl.ts";

interface TickerLike {
  add: (fn: () => void) => void;
  remove: (fn: () => void) => void;
}

export async function mountThreeHero(canvas: HTMLCanvasElement, poster: HTMLElement): Promise<() => void> {
  const opened = beginScene(canvas, poster, readPowerSignals());
  if (opened.mode === "still") return () => {};
  const gl = opened.gl;
  const THREE = await import("three");
  const gsapMod = (await import("gsap")) as unknown as { default: { ticker: TickerLike } };
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl,
    antialias: false,
    alpha: true,
  });
  renderer.setPixelRatio(capDpr(opened.settings.dprCap, window.devicePixelRatio));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  camera.position.z = 4;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc8c2b4 }));
  scene.add(mesh);
  scene.add(new THREE.DirectionalLight(0xffffff, 2));
  let running = true;
  const tick = (): void => {
    if (!running) return;
    mesh.rotation.y += 0.01;
    renderer.render(scene, camera);
  };
  gsapMod.default.ticker.add(tick);
  const guard = createContextGuard();
  const stopLoss = bindContextLoss(
    canvas,
    guard,
    () => {
      running = false;
      showArtDirectedStill(poster, HERO_POSE, HERO_POSE, posterImageFrom(poster));
    },
    () => {
      running = true;
    },
  );
  const stopWatch = pauseOffscreen(canvas, (state) => {
    running = state === "resume";
  });
  return () => {
    running = false;
    stopWatch();
    stopLoss();
    gsapMod.default.ticker.remove(tick);
    renderer.dispose();
  };
}
