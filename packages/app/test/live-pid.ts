/**
 * A child that stays alive until stop().
 * The build watchdog treats a dead pid as a failed build while its done
 * promise is still open. The child is not this process, so settling the
 * run does not wait on the test itself.
 */
import { spawn, type ChildProcess } from "node:child_process";

export function startLivePid(): { pid: number; stop: () => void } {
  const child: ChildProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  if (child.pid === undefined || child.pid <= 0) {
    child.kill();
    throw new Error("The live pid child did not start.");
  }
  return {
    pid: child.pid,
    stop: () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    },
  };
}
