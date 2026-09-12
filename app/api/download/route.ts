import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { createJob, dropJob, getJob, type Job } from "@/lib/jobs";
import { contentTypeFor } from "@/lib/mime";
import { YTDLP, baseArgs, cleanError, formatSelector, isYouTubeUrl } from "@/lib/ytdlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Downloading and merging a large video is slow; take the whole window allowed.
export const maxDuration = 300;

const PROGRESS_TEMPLATE =
  "download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

/**
 * A current yt-dlp handles ordinary videos on the default client at full
 * quality. The android fallback exists only for the window after YouTube ships
 * a new defence and before nightly catches up: it usually still gets through,
 * but SABR caps it at a single 360p progressive stream, so it is a last resort
 * and the UI says so when it fires.
 */
const ATTEMPTS: { extra: string[]; restricted: boolean }[] = [
  { extra: [], restricted: false },
  { extra: ["--extractor-args", "youtube:player_client=android"], restricted: true },
];

function num(raw: string): number | null {
  if (!raw || raw === "NA" || raw === "None") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function humanSpeed(bytesPerSecond: number | null): string | null {
  if (!bytesPerSecond) return null;
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSecond;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function applyLine(job: Job, line: string): void {
  if (line.startsWith("PROG|")) {
    const [, downloaded, total, estimate, speed, eta] = line.split("|");
    const have = num(downloaded);
    const want = num(total) ?? num(estimate);
    // Video and audio are fetched as separate files, so yt-dlp's percentage
    // restarts at 0 for the second one. Only ever move forwards; the audio
    // stream is a rounding error next to the video and finishes in moments.
    if (have !== null && want) {
      job.percent = Math.max(job.percent, Math.min(100, (have / want) * 100));
    }
    job.speed = humanSpeed(num(speed));
    job.eta = num(eta);
    if (job.status === "merging") job.status = "downloading";
    return;
  }
  if (line.includes("[Merger]") || line.includes("[ExtractAudio]") || line.includes("[VideoRemuxer]")) {
    job.status = "merging";
    job.percent = 100;
    job.speed = null;
    job.eta = null;
  }
}

/** Errors worth retrying on the restricted fallback client. */
function isGated(stderr: string): boolean {
  return /403|Forbidden|PO Token|format is not available|Sign in to confirm/i.test(stderr);
}

function explain(message: string): string {
  if (/DRM/i.test(message)) {
    return `${message} — this video is DRM protected and cannot be downloaded.`;
  }
  if (/Sign in to confirm/i.test(message)) {
    return `${message} — YouTube is blocking this server's IP, which is common on hosted deployments. Set YTDLP_COOKIES_FILE (see README).`;
  }
  if (/403|Forbidden|PO Token/i.test(message)) {
    return `${message} — a stale yt-dlp is the usual cause. Run \`npm run update-ytdlp\` and try again.`;
  }
  return message;
}

function runAttempt(
  job: Job,
  url: string,
  quality: string,
  extra: string[],
): Promise<{ ok: boolean; stderr: string }> {
  const { format, audioOnly } = formatSelector(quality);
  const args = [
    ...baseArgs(),
    ...extra,
    "-f",
    format,
    ...(audioOnly ? ["--extract-audio", "--audio-format", "m4a"] : ["--merge-output-format", "mp4"]),
    "-o",
    path.join(job.dir, "%(title).150B [%(id)s].%(ext)s"),
    "--retries",
    "5",
    "--fragment-retries",
    "5",
    "--concurrent-fragments",
    "4",
    "--newline",
    "--progress",
    "--progress-template",
    PROGRESS_TEMPLATE,
    url,
  ];

  return new Promise((resolve) => {
    const child = spawn(YTDLP, args, { windowsHide: true });
    let stderr = "";
    let buffer = "";

    const consume = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) applyLine(job, line.trim());
    };

    child.stdout.on("data", consume);
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      consume(d);
    });
    child.on("error", (e) => resolve({ ok: false, stderr: e.message }));
    child.on("close", (code) => resolve({ ok: code === 0, stderr }));
  });
}

/** Locate what yt-dlp produced and mark the job done. */
async function finish(job: Job): Promise<boolean> {
  const entries = await readdir(job.dir).catch(() => [] as string[]);
  const files = entries.filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
  if (files.length === 0) return false;

  // A merge leaves exactly one output; if not, the largest file is the real one.
  let picked = files[0];
  let pickedSize = 0;
  for (const f of files) {
    const s = await stat(path.join(job.dir, f)).catch(() => null);
    if (s && s.size > pickedSize) {
      pickedSize = s.size;
      picked = f;
    }
  }
  job.filePath = path.join(job.dir, picked);
  job.filename = picked;
  job.size = pickedSize;
  job.percent = 100;
  job.status = "done";
  return true;
}

async function runJob(job: Job, url: string, quality: string): Promise<void> {
  let lastError = "";

  for (const attempt of ATTEMPTS) {
    job.percent = 0;
    job.status = "downloading";
    const { ok, stderr } = await runAttempt(job, url, quality, attempt.extra);

    if (ok && (await finish(job))) {
      job.restricted = attempt.restricted;
      return;
    }

    lastError = stderr || lastError;
    // Only the gate is worth a second, lower-quality try.
    if (!isGated(stderr)) break;
    await rm(job.dir, { recursive: true, force: true }).catch(() => {});
    await mkdir(job.dir, { recursive: true }).catch(() => {});
  }

  job.status = "error";
  job.error = explain(cleanError(lastError) || "yt-dlp could not download this video.");
}

/**
 * Deployed, the function's disk dies with the invocation, so the finished file
 * goes to Vercel Blob and the browser is sent there. Locally there is no Blob
 * token and no reason to involve the network, so it is served straight off disk.
 */
async function deliver(job: Job): Promise<string> {
  if (!job.filePath || !job.filename) throw new Error("Nothing to deliver.");

  // Only deployed. `vercel blob create-store` puts a token in .env.local too, and
  // keying off the token alone would make every local download round-trip the
  // whole file to the cloud and back — far slower than the download itself, and
  // billable. Vercel sets VERCEL=1 in its runtime.
  if (!process.env.VERCEL || !process.env.BLOB_READ_WRITE_TOKEN) {
    return `/api/file?id=${job.id}`;
  }

  job.status = "uploading";
  const blob = await put(job.filename, createReadStream(job.filePath), {
    access: "public",
    contentType: contentTypeFor(job.filename),
    addRandomSuffix: true,
  });
  await dropJob(job.id);
  // downloadUrl carries a content-disposition attachment header; blob.url would
  // just play the video in the tab, since a cross-origin `download` attribute
  // is ignored by the browser.
  return blob.downloadUrl;
}

export async function POST(request: Request) {
  let url = "";
  let quality = "best";
  try {
    const body = (await request.json()) as { url?: string; quality?: string };
    url = (body.url ?? "").trim();
    quality = body.quality ?? "best";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isYouTubeUrl(url)) {
    return NextResponse.json({ error: "That doesn't look like a YouTube link." }, { status: 400 });
  }

  const job = createJob();
  await mkdir(job.dir, { recursive: true });

  // One invocation does the whole job and streams progress back, so nothing has
  // to be shared between requests — which is what makes this work on serverless.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (payload: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          open = false;
        }
      };

      const tick = () =>
        send({
          type: "progress",
          status: job.status,
          percent: Math.round(job.percent),
          speed: job.speed,
          eta: job.eta,
        });

      tick();
      const ticker = setInterval(tick, 400);

      try {
        await runJob(job, url, quality);

        if (job.status === "error") {
          send({ type: "error", error: job.error });
        } else {
          const filename = job.filename;
          const size = job.size;
          const restricted = job.restricted;
          tick();
          const href = await deliver(job);
          send({ type: "done", url: href, filename, size, restricted });
        }
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Download failed." });
      } finally {
        clearInterval(ticker);
        open = false;
        controller.close();
      }
    },
    cancel() {
      // Browser went away mid-download; don't leave the file behind.
      void dropJob(job.id);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing job id." }, { status: 400 });

  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "That download expired." }, { status: 404 });

  return NextResponse.json({
    status: job.status,
    percent: Math.round(job.percent),
    filename: job.filename,
    size: job.size,
    restricted: job.restricted,
    error: job.error,
  });
}
