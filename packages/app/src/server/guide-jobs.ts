/**
 * Guide work lives here, off the request that started it.
 * One queue per desk process so two submits cannot run the same turn twice.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";

export interface GuideJobView {
  id: string;
  status: "running" | "done" | "failed";
  httpStatus: number;
  body: Record<string, unknown> | null;
}

interface StoredJob extends GuideJobView {
  key: string;
}

export interface GuideJobs {
  start(key: string, run: () => Promise<{ httpStatus: number; body: Record<string, unknown> }>): GuideJobView;
  read(id: string): GuideJobView | null;
  running(): { id: string; status: "running" } | null;
}

export function createGuideJobs(): GuideJobs {
  const jobs = new Map<string, StoredJob>();
  const runningByKey = new Map<string, string>();
  let tail: Promise<void> = Promise.resolve();

  return {
    start(key, run) {
      const existingId = runningByKey.get(key);
      if (existingId !== undefined) {
        const existing = jobs.get(existingId);
        if (existing !== undefined && existing.status === "running") return existing;
      }
      const job: StoredJob = {
        id: randomUUID(),
        key,
        status: "running",
        httpStatus: 200,
        body: null,
      };
      jobs.set(job.id, job);
      runningByKey.set(key, job.id);
      const execute = tail.then(async () => {
        try {
          const result = await run();
          job.httpStatus = result.httpStatus;
          job.body = result.body;
          job.status = result.httpStatus >= 400 ? "failed" : "done";
        } catch (error: unknown) {
          job.status = "failed";
          job.httpStatus = 500;
          job.body = { error: error instanceof Error && error.message.trim() !== "" ? error.message : "The Guide could not finish." };
        } finally {
          if (runningByKey.get(key) === job.id) runningByKey.delete(key);
        }
      });
      tail = execute.then(
        () => undefined,
        () => undefined,
      );
      return { id: job.id, status: job.status, httpStatus: job.httpStatus, body: job.body };
    },
    read(id) {
      const job = jobs.get(id);
      if (job === undefined) return null;
      return { id: job.id, status: job.status, httpStatus: job.httpStatus, body: job.body };
    },
    running() {
      for (const job of jobs.values()) {
        if (job.status === "running") return { id: job.id, status: "running" };
      }
      return null;
    },
  };
}

const desks = new Map<string, GuideJobs>();

export function guideJobsFor(projectDir: string): GuideJobs {
  const key = path.resolve(projectDir);
  const existing = desks.get(key);
  if (existing !== undefined) return existing;
  const created = createGuideJobs();
  desks.set(key, created);
  return created;
}

export function forgetGuideJobs(projectDir: string): void {
  desks.delete(path.resolve(projectDir));
}
