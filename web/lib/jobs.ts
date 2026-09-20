import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type JobStatus = "downloading" | "merging" | "uploading" | "done" | "error";

export type Job = {
  id: string;
  status: JobStatus;
  /** 0-100 for the file currently being downloaded. */
  percent: number;
  /** Human readable, e.g. "4.2MiB/s". */
  speed: string | null;
  eta: number | null;
  /** Absolute path of the finished file. */
  filePath: string | null;
  filename: string | null;
  size: number | null;
  error: string | null;
  /** True when only a restricted-fallback (lower quality) stream was obtainable. */
  restricted: boolean;
  dir: string;
  createdAt: number;
};

// Survives Next.js hot reloads in dev.
const store: Map<string, Job> =
  (globalThis as { __ytJobs?: Map<string, Job> }).__ytJobs ??
  ((globalThis as { __ytJobs?: Map<string, Job> }).__ytJobs = new Map());

export const JOB_ROOT = path.join(os.tmpdir(), "yt-downloader-jobs");

export function createJob(): Job {
  const id = randomUUID();
  const job: Job = {
    id,
    status: "downloading",
    percent: 0,
    speed: null,
    eta: null,
    filePath: null,
    filename: null,
    size: null,
    error: null,
    restricted: false,
    dir: path.join(JOB_ROOT, id),
    createdAt: Date.now(),
  };
  store.set(id, job);
  sweep();
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export async function dropJob(id: string): Promise<void> {
  const job = store.get(id);
  if (!job) return;
  store.delete(id);
  await rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

/** Delete jobs older than an hour so temp files don't pile up. */
function sweep(): void {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const job of store.values()) {
    if (job.createdAt < cutoff) void dropJob(job.id);
  }
}
