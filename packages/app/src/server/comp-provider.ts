/**
 * A test can hand the desk a sketch provider for one project.
 * The live desk leaves this empty and uses the Imagine desk provider.
 */
import path from "node:path";
import type { RenderDeskProvider } from "@hitchhiker/engine";

const providers = new Map<string, RenderDeskProvider>();

export function setDeskCompProvider(projectDir: string, provider: RenderDeskProvider | null): void {
  const key = path.resolve(projectDir);
  if (provider === null) providers.delete(key);
  else providers.set(key, provider);
}

export function deskCompProvider(projectDir: string): RenderDeskProvider | undefined {
  return providers.get(path.resolve(projectDir));
}
