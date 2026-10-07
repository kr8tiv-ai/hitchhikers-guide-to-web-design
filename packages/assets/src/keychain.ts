/**
 * xAI API key for Imagine.
 *
 * The environment variable XAI_API_KEY wins. If it is empty, the OS
 * keychain is next: an injected reader, or the optional `keytar` package
 * when it is installed. A project file is never a source. The key is
 * returned to the caller and is not logged here.
 */

export const KEYCHAIN_SERVICE = "hitchhikers-guide";
export const KEYCHAIN_ACCOUNT = "xai";

const KEYTAR_SPECIFIER = "keytar";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "No xAI API key. Set XAI_API_KEY, or store it in the OS keychain under service hitchhikers-guide and account xai. A key is not read from a project file.",
    );
    this.name = "MissingApiKeyError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface KeychainGet {
  getPassword(service: string, account: string): Promise<string | null>;
}

export interface ReadKeyDeps {
  env?: Record<string, string | undefined>;
  /** Pass null to skip the keychain. Omit to try the optional loader. */
  keychain?: KeychainGet | null;
  loadKeychain?: () => Promise<KeychainGet | null>;
}

export async function readApiKey(deps: ReadKeyDeps = {}): Promise<string> {
  const env = deps.env ?? process.env;
  const fromEnv = readSecret(env.XAI_API_KEY);
  if (fromEnv !== null) return fromEnv;

  const chain = await resolveKeychain(deps);
  if (chain !== null) {
    const stored = readSecret(await chain.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT));
    if (stored !== null) return stored;
  }

  throw new MissingApiKeyError();
}

async function resolveKeychain(deps: ReadKeyDeps): Promise<KeychainGet | null> {
  if (deps.keychain !== undefined) return deps.keychain;
  const load = deps.loadKeychain ?? loadOptionalKeytar;
  return load();
}

async function loadOptionalKeytar(): Promise<KeychainGet | null> {
  try {
    const loaded = await importOptional(KEYTAR_SPECIFIER);
    return asKeychain(loaded);
  } catch {
    return null;
  }
}

function importOptional(specifier: string): Promise<unknown> {
  return import(specifier) as Promise<unknown>;
}

function unwrapModule(loaded: unknown): Record<string, unknown> | null {
  if (typeof loaded !== "object" || loaded === null) return null;
  const record = loaded as Record<string, unknown>;
  const inner = record.default;
  if (typeof inner === "object" && inner !== null) return inner as Record<string, unknown>;
  return record;
}

function asKeychain(loaded: unknown): KeychainGet | null {
  const source = unwrapModule(loaded);
  if (source === null) return null;
  const getPassword = source.getPassword;
  if (typeof getPassword !== "function") return null;
  return {
    getPassword: (service: string, account: string) =>
      Promise.resolve(getPassword.call(source, service, account)).then(readSecret),
  };
}

function readSecret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\r\n]/.test(value)) {
    throw new MissingApiKeyError();
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}
