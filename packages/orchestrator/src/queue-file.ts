/**
 * Drive queue on disk, re-exported from `@hitchhiker/engine`.
 *
 * The implementation lives in the engine so the desk can load
 * `.hitchhiker/queue.json` without depending on this package.
 * This file does not start a model session or the drive runner.
 */
export {
  QueueFileError,
  loadQueue,
  pauseQueue,
  saveQueue,
  type QueueFile,
  type QueueStatus,
} from "@hitchhiker/engine";
