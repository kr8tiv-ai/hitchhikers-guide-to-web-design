/**
 * A shell left over from the test suite can still have HH_CASSETTE=replay.
 * Live commands refuse that unless this process is the test runner, or the
 * user opts in with --cassette or HH_ALLOW_CASSETTE=1.
 */

export const REPLAY_NOTICE = "Replay mode: answers come from recorded cassettes.";
export const RECORD_NOTICE = "Record mode: answers are written to cassettes.";

const CASSETTE_FLAG = "--cassette";

export function cassetteLabel(env: NodeJS.ProcessEnv): string {
  const raw = env.HH_CASSETTE;
  if (raw === undefined || raw.trim() === "" || raw === "off") return "off";
  return raw;
}

/** `cassette: off` or `cassette: replay (set in this shell)`. A warning line, not a failure. */
export function formatCassetteLine(label: string): string {
  if (label === "off") return "cassette: off";
  return `cassette: ${label} (set in this shell)`;
}

function shellMode(env: NodeJS.ProcessEnv): "replay" | "record" | null {
  const raw = env.HH_CASSETTE;
  if (raw === "replay" || raw === "record") return raw;
  return null;
}

function optedIn(env: NodeJS.ProcessEnv, argv: readonly string[]): boolean {
  return argv.includes(CASSETTE_FLAG) || env.HH_ALLOW_CASSETTE === "1";
}

function inTest(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_TEST_CONTEXT !== undefined && env.NODE_TEST_CONTEXT !== "";
}

/**
 * Stderr line when a live command must exit 2.
 * Null when cassette mode is off, the process is a test, or the user opted in.
 */
export function cassetteRefusal(env: NodeJS.ProcessEnv, argv: readonly string[]): string | null {
  const mode = shellMode(env);
  if (mode === null || inTest(env) || optedIn(env, argv)) return null;
  const effect =
    mode === "replay"
      ? "The Guide would only replay recorded answers."
      : "The Guide would record answers instead of talking live.";
  return `HH_CASSETTE=${mode} is set in this shell. ${effect} Clear it (Remove-Item Env:HH_CASSETTE) or pass --cassette to keep it.\n`;
}

/** Desk status sentence when replay or record was explicitly allowed. */
export function cassetteNotice(env: NodeJS.ProcessEnv, argv: readonly string[]): string | null {
  const mode = shellMode(env);
  if (mode === null || !optedIn(env, argv)) return null;
  return mode === "replay" ? REPLAY_NOTICE : RECORD_NOTICE;
}
