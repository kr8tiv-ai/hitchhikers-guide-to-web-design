/**
 * Live layer over the splash video. Additive points, warm paper and cool white,
 * a few comets, sparse tumbling debris. One WebGL context. Transparent clear
 * so the footage stays the plate.
 */

import { splashBudget, type SplashSignals } from "./tier.ts";

export interface SplashMountInput {
  reducedMotion: boolean;
  reducedData: boolean;
  saveData: boolean;
  width: number;
  devicePixelRatio: number;
}

export interface SplashHandle {
  readonly canvas: HTMLCanvasElement;
  start(): void;
  stop(): void;
  destroy(): void;
}

interface CometPath {
  positions: Float32Array;
  colors: Float32Array;
  period: number;
  phase: number;
  lane: number;
  tilt: number;
}

export async function mountSplashScene(host: HTMLElement, input: SplashMountInput): Promise<SplashHandle | null> {
  if (input.reducedMotion || input.reducedData || input.saveData) return null;
  const THREE = await import("three");
  const canvas = document.createElement("canvas");
  canvas.className = "hh-splash__gl";
  canvas.setAttribute("data-splash-gl", "");
  canvas.setAttribute("data-gl-state", "paused");
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
  } catch {
    canvas.remove();
    return null;
  }
  const gl = renderer.getContext();
  if (gl === null) {
    renderer.dispose();
    canvas.remove();
    return null;
  }
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = debug === null ? "" : String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "");
  const signals: SplashSignals = {
    reducedMotion: false,
    reducedData: false,
    saveData: false,
    webgl: true,
    renderer: rendererName,
    performanceCaveat: false,
    width: input.width,
    devicePixelRatio: input.devicePixelRatio,
  };
  const budget = splashBudget(signals);
  if (budget.mode === "poster") {
    renderer.dispose();
    canvas.remove();
    return null;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(budget.dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 40);
  camera.position.set(0, 0, 8);
  const world = new THREE.Group();
  scene.add(world);

  const stars = makeStars(THREE, budget.counts.stars);
  world.add(stars.points);
  const comets = makeComets(THREE, budget.counts.comets, budget.counts.tail);
  for (const comet of comets.meshes) world.add(comet);
  const rocks = makeDebris(THREE, budget.counts.debris);
  for (const rock of rocks) world.add(rock.mesh);

  let running = false;
  let frame = 0;
  let last = performance.now();
  const pointer = { x: 0, y: 0 };
  let scroll = 0;

  function resize(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width < 2 || height < 2) return;
    renderer.setPixelRatio(budget.dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function onPointer(event: PointerEvent): void {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    pointer.x = event.clientX / width * 2 - 1;
    pointer.y = event.clientY / height * 2 - 1;
  }

  function onScroll(): void {
    const rect = host.getBoundingClientRect();
    const height = Math.max(rect.height, 1);
    scroll = Math.max(-1, Math.min(1, -rect.top / height));
  }

  function tick(now: number): void {
    if (!running) return;
    frame = window.requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const elapsed = now / 1000;
    driftStars(stars, dt);
    driftComets(comets, elapsed);
    driftRocks(rocks, elapsed, dt);
    world.position.x += (pointer.x * 0.28 + scroll * 0.12 - world.position.x) * 0.06;
    world.position.y += (-pointer.y * 0.16 - world.position.y) * 0.06;
    world.rotation.z += (pointer.x * -0.02 - world.rotation.z) * 0.05;
    renderer.render(scene, camera);
  }

  function start(): void {
    if (running) return;
    running = true;
    canvas.setAttribute("data-gl-state", "running");
    last = performance.now();
    frame = window.requestAnimationFrame(tick);
  }

  function stop(): void {
    running = false;
    canvas.setAttribute("data-gl-state", "paused");
    if (frame !== 0) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  const observed = new ResizeObserver(() => resize());
  observed.observe(host);
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  resize();
  onScroll();

  return {
    canvas,
    start,
    stop,
    destroy() {
      stop();
      observed.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      stars.geometry.dispose();
      stars.material.dispose();
      for (const material of comets.materials) material.dispose();
      for (const geometry of comets.geometries) geometry.dispose();
      for (const rock of rocks) {
        rock.geometry.dispose();
        rock.material.dispose();
      }
      renderer.dispose();
      canvas.remove();
    },
  };
}

function makeStars(THREE: typeof import("three"), count: number): {
  points: import("three").Points;
  positions: Float32Array;
  speeds: Float32Array;
  geometry: import("three").BufferGeometry;
  material: import("three").PointsMaterial;
} {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const palette = [
    [0.97, 0.94, 0.89],
    [0.78, 0.86, 0.95],
    [0.93, 0.74, 0.48],
  ];
  for (let index = 0; index < count; index += 1) {
    const i3 = index * 3;
    positions[i3] = (hash(index + 1) - 0.5) * 16;
    positions[i3 + 1] = (hash(index + 17) - 0.5) * 9;
    positions[i3 + 2] = (hash(index + 29) - 0.5) * 8;
    const tone = palette[index % palette.length] ?? palette[0];
    const dim = 0.45 + hash(index + 3) * 0.55;
    colors[i3] = (tone?.[0] ?? 1) * dim;
    colors[i3 + 1] = (tone?.[1] ?? 1) * dim;
    colors[i3 + 2] = (tone?.[2] ?? 1) * dim;
    speeds[index] = 0.05 + hash(index + 11) * 0.22;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.035,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  return { points: new THREE.Points(geometry, material), positions, speeds, geometry, material };
}

function makeComets(THREE: typeof import("three"), count: number, tail: number): {
  meshes: import("three").Points[];
  paths: CometPath[];
  geometries: import("three").BufferGeometry[];
  materials: import("three").PointsMaterial[];
} {
  const meshes: import("three").Points[] = [];
  const paths: CometPath[] = [];
  const geometries: import("three").BufferGeometry[] = [];
  const materials: import("three").PointsMaterial[] = [];
  for (let index = 0; index < count; index += 1) {
    const positions = new Float32Array(tail * 3);
    const colors = new Float32Array(tail * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.11 - index * 0.012,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    meshes.push(points);
    geometries.push(geometry);
    materials.push(material);
    paths.push({
      positions,
      colors,
      period: 26 + index * 7,
      phase: index * 0.37,
      lane: (index - (count - 1) / 2) * 1.15,
      tilt: (hash(index + 5) - 0.5) * 0.6,
    });
  }
  return { meshes, paths, geometries, materials };
}

function makeDebris(THREE: typeof import("three"), count: number): {
  mesh: import("three").Mesh;
  geometry: import("three").BufferGeometry;
  material: import("three").MeshBasicMaterial;
  spin: number;
  seed: number;
}[] {
  const rocks = [];
  for (let index = 0; index < count; index += 1) {
    const radius = 0.05 + hash(index + 9) * 0.07;
    const geometry = new THREE.OctahedronGeometry(radius, 0);
    const material = new THREE.MeshBasicMaterial({
      color: index % 2 === 0 ? 0x6a5644 : 0x3e4a55,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((hash(index + 2) - 0.5) * 11, (hash(index + 8) - 0.5) * 5.5, (hash(index + 13) - 0.6) * 4);
    mesh.rotation.set(hash(index + 4) * 3, hash(index + 6) * 3, 0);
    rocks.push({ mesh, geometry, material, spin: 0.15 + hash(index + 15) * 0.45, seed: index * 1.7 });
  }
  return rocks;
}

function driftStars(
  stars: { positions: Float32Array; speeds: Float32Array; geometry: import("three").BufferGeometry },
  dt: number,
): void {
  const positions = stars.positions;
  for (let index = 0; index < stars.speeds.length; index += 1) {
    const i3 = index * 3;
    const depth = 1.2 + Math.abs(positions[i3 + 2] ?? 0) * 0.15;
    positions[i3] = (positions[i3] ?? 0) - (stars.speeds[index] ?? 0) * dt * depth;
    if ((positions[i3] ?? 0) < -8) positions[i3] = 8;
  }
  const attribute = stars.geometry.getAttribute("position");
  attribute.needsUpdate = true;
}

function driftComets(comets: { paths: CometPath[]; geometries: import("three").BufferGeometry[] }, elapsed: number): void {
  for (let index = 0; index < comets.paths.length; index += 1) {
    const path = comets.paths[index];
    if (path === undefined) continue;
    const head = (elapsed / path.period + path.phase) % 1;
    const samples = path.positions.length / 3;
    for (let sample = 0; sample < samples; sample += 1) {
      const along = head - sample * 0.0045;
      const wrapped = along < 0 ? along + 1 : along;
      const place = cometPoint(wrapped, path);
      const i3 = sample * 3;
      path.positions[i3] = place[0];
      path.positions[i3 + 1] = place[1];
      path.positions[i3 + 2] = place[2];
      const fade = place[3] * (1 - sample / samples);
      path.colors[i3] = 1 * fade;
      path.colors[i3 + 1] = 0.9 * fade;
      path.colors[i3 + 2] = 0.72 * fade;
    }
    const geometry = comets.geometries[index];
    if (geometry === undefined) continue;
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
  }
}

function cometPoint(u: number, path: CometPath): [number, number, number, number] {
  const visible = u > 0.16 && u < 0.74;
  if (!visible) return [-30, path.lane, -2, 0];
  const span = (u - 0.16) / 0.58;
  const x = -8.5 + span * 17;
  const y = path.lane + Math.sin(span * 3.1) * path.tilt;
  const z = -1.5 + span * 0.8;
  return [x, y, z, 1];
}

function driftRocks(
  rocks: { mesh: import("three").Mesh; spin: number; seed: number }[],
  elapsed: number,
  dt: number,
): void {
  for (const rock of rocks) {
    rock.mesh.rotation.x += dt * rock.spin;
    rock.mesh.rotation.y += dt * rock.spin * 0.65;
    rock.mesh.position.y += Math.sin(elapsed * 0.35 + rock.seed) * 0.0008;
  }
}

function hash(index: number): number {
  const value = Math.sin(index * 127.1) * 43758.5453;
  return value - Math.floor(value);
}
