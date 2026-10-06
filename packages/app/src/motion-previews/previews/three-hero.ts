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

const WEBGL_ID = "three-hero";

export function mountPreview(el: HTMLElement): Promise<() => void> {
  return runWhenVisible(el, async () => {
    if (!claimWebgl(WEBGL_ID)) {
      paintStill(el, "Another WebGL preview is live.");
      return () => undefined;
    }
    await ensureSharedTicker();
    try {
      const THREE = await import("three");
      const width = Math.max(320, el.clientWidth);
      const height = Math.max(200, el.clientHeight);
      const renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.domElement.className = "hh-motion__gl";
      el.replaceChildren(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10);
      camera.position.z = 3.2;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ color: 0x8e2f1a });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      markLive(el);
      el.dataset.webglLive = "true";
      const off = onSharedTick(() => {
        mesh.rotation.y += 0.02;
        mesh.rotation.x += 0.01;
        renderer.render(scene, camera);
      });
      return () => {
        off();
        el.dataset.webglLive = "false";
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        releaseWebgl(WEBGL_ID);
      };
    } catch {
      releaseWebgl(WEBGL_ID);
      paintStill(el, "WebGL is not available on this machine.");
      return () => undefined;
    }
  });
}
