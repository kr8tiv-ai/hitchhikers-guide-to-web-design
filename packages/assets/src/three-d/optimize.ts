/**
 * Inspect and optimize a glTF or GLB.
 *
 * Texture edges longer than maxTexture are resized (2048 is the usual cap).
 * Geometry is then Draco or Meshopt compressed. Compression is applied when
 * the file is written. Output belongs under .hitchhiker/assets/3d/.
 */

import { mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, draco, inspect, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

export interface OptimizeOptions {
  maxTexture: number;
  encoder: "meshopt" | "draco";
}

export interface OptimizeResult {
  bytes: number;
  triangles: number;
}

export interface InspectResult {
  bytes: number;
  triangles: number;
  textureMb: number;
}

interface DracoModules {
  createEncoderModule(): Promise<unknown>;
  createDecoderModule(): Promise<unknown>;
}

export function glbOutputPath(projectRoot: string, name: string): string {
  const trimmed = name.trim().replace(/\.glb$/i, "");
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  const file = safe.length > 0 ? safe : "model";
  return path.join(projectRoot, ".hitchhiker", "assets", "3d", `${file}.glb`);
}

export async function inspectGlb(input: string): Promise<InspectResult> {
  const io = await createIo();
  const doc = await io.read(input);
  const bytes = (await stat(input)).size;
  return {
    bytes,
    triangles: countTriangles(doc),
    textureMb: textureMegabytes(doc),
  };
}

export async function optimizeGlb(input: string, output: string, opts: OptimizeOptions): Promise<OptimizeResult> {
  if (!Number.isInteger(opts.maxTexture) || opts.maxTexture < 1) {
    throw new Error("maxTexture must be a positive integer.");
  }
  if (opts.encoder !== "meshopt" && opts.encoder !== "draco") {
    throw new Error("encoder must be meshopt or draco.");
  }
  const io = await createIo();
  const doc = await io.read(input);
  const transforms = [];
  if (doc.getRoot().listTextures().length > 0) {
    transforms.push(textureCompress({ resize: [opts.maxTexture, opts.maxTexture] }));
  }
  transforms.push(dedup(), prune());
  if (opts.encoder === "draco") {
    transforms.push(draco({ method: "edgebreaker" }));
  } else {
    await MeshoptEncoder.ready;
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  }
  await doc.transform(...transforms);
  const triangles = countTriangles(doc);
  await mkdir(path.dirname(output), { recursive: true });
  await io.write(output, doc);
  const bytes = (await stat(output)).size;
  return { bytes, triangles };
}

async function createIo(): Promise<NodeIO> {
  const dracoModules = loadDraco();
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const [encoder, decoder] = await Promise.all([
    dracoModules.createEncoderModule(),
    dracoModules.createDecoderModule(),
  ]);
  return new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      "draco3d.encoder": encoder,
      "draco3d.decoder": decoder,
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.decoder": MeshoptDecoder,
    });
}

function loadDraco(): DracoModules {
  const require = createRequire(import.meta.url);
  const loaded: unknown = require("draco3dgltf");
  if (typeof loaded !== "object" || loaded === null) {
    throw new Error("draco3dgltf did not load.");
  }
  const record = loaded as Record<string, unknown>;
  const createEncoderModule = record.createEncoderModule;
  const createDecoderModule = record.createDecoderModule;
  if (typeof createEncoderModule !== "function" || typeof createDecoderModule !== "function") {
    throw new Error("draco3dgltf is missing an encoder or decoder.");
  }
  return {
    createEncoderModule: () => Promise.resolve(createEncoderModule.call(record)),
    createDecoderModule: () => Promise.resolve(createDecoderModule.call(record)),
  };
}

function countTriangles(doc: Document): number {
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices !== null) {
        triangles += Math.floor(indices.getCount() / 3);
        continue;
      }
      const position = prim.getAttribute("POSITION");
      if (position !== null) triangles += Math.floor(position.getCount() / 3);
    }
  }
  return triangles;
}

function textureMegabytes(doc: Document): number {
  const report = inspect(doc);
  let bytes = 0;
  for (const texture of report.textures.properties) {
    if (typeof texture.gpuSize === "number" && Number.isFinite(texture.gpuSize)) {
      bytes += texture.gpuSize;
    }
  }
  return bytes / (1024 * 1024);
}
