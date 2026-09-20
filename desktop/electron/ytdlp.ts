import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DownloadRequest, DownloadResult, Progress, VideoInfo } from "../shared/api";
import { resolveFfmpeg, resolveYtdlp } from "./paths";
import { getSettings } from "./settings";
import {
  CORE_ARGS,
  PROGRESS_TEMPLATE,
  cleanError,
  explain,
  formatDuration,
  formatSelector,
  isGated,
  parseProgressLine,
} from "./ytdlp-core";

export class YtdlpMissingError extends Error {
  constructor() {
    super("yt-dlp is not installed. Open Settings and choose “Update yt-dlp”.");
    this.name = "YtdlpMissingError";
  }
}

function binary(): string {
  const found = resolveYtdlp();
  if (!found) throw new YtdlpMissingError();
  return found.path;
}

function baseArgs(): string[] {
  const args = [...CORE_ARGS];
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg) args.push("--ffmpeg-location", ffmpeg);

  const { cookiesFile, cookiesFromBrowser } = getSettings();
  if (cookiesFile && existsSync(cookiesFile)) args.push("--cookies", cookiesFile);
  else if (cookiesFromBrowser) args.push("--cookies-from-browser", cookiesFromBrowser);
  return args;
}

/** Run yt-dlp and buffer stdout. Used for metadata and --version only. */
function run(args: string[], timeoutMs = 60_000): Promise<string> {
  const exe = binary();
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error("yt-dlp timed out"));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(explain(cleanError(err) || `yt-dlp exited with code ${code}`)));
    });
  });
}

export async function ytdlpVersion(): Promise<string | null> {
  if (!resolveYtdlp()) return null;
  try {
    return (await run(["--version"], 15_000)).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Info

type RawFormat = { height?: number | null; vcodec?: string | null };
type RawThumb = { url?: string; width?: number };

// Highest quality first. yt-dlp lists these without checking they exist, and
// YouTube only generates the larger sizes for high-resolution uploads, so each
// candidate has to be probed before it is offered to the user.
const THUMB_LADDER = ["maxresdefault", "sddefault", "hq720", "hqdefault", "mqdefault", "default"];

async function bestThumbnail(id: string, info: { thumbnails?: RawThumb[]; thumbnail?: string }) {
  for (const name of THUMB_LADDER) {
    const candidate = `https://i.ytimg.com/vi/${id}/${name}.jpg`;
    const res = await fetch(candidate, { method: "HEAD" }).catch(() => null);
    if (res?.ok) return candidate;
  }
  const widest = (info.thumbnails ?? [])
    .filter((t): t is RawThumb & { url: string } => Boolean(t?.url))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return widest?.url ?? info.thumbnail ?? "";
}

export async function fetchInfo(url: string): Promise<VideoInfo> {
  const json = await run([...baseArgs(), "--dump-single-json", url]);
  const info = JSON.parse(json) as {
    id: string;
    title: string;
    channel?: string;
    uploader?: string;
    duration?: number;
    view_count?: number;
    upload_date?: string;
    webpage_url?: string;
    formats?: RawFormat[];
    thumbnails?: RawThumb[];
    thumbnail?: string;
  };

  const heights = [
    ...new Set(
      (info.formats ?? [])
        .filter((f) => f.vcodec && f.vcodec !== "none" && typeof f.height === "number")
        .map((f) => f.height as number),
    ),
  ].sort((a, b) => b - a);

  return {
    id: info.id,
    title: info.title,
    channel: info.channel ?? info.uploader ?? "",
    duration: info.duration ?? null,
    durationLabel: formatDuration(info.duration ?? null),
    viewCount: info.view_count ?? null,
    uploadDate: info.upload_date
      ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
      : null,
    webpageUrl: info.webpage_url ?? url,
    thumbnail: await bestThumbnail(info.id, info),
    qualities: [
      { value: "best", label: heights[0] ? `Best available (${heights[0]}p)` : "Best available" },
      ...heights.map((h) => ({ value: String(h), label: `${h}p` })),
      { value: "audio", label: "Audio only (m4a)" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Download

/**
 * A current yt-dlp handles ordinary videos on the default client at full
 * quality. The android fallback exists only for the window after YouTube ships
 * a new defence and before nightly catches up: it usually still gets through,
 * but is capped at a single 360p progressive stream, so it is a last resort and
 * the UI says so when it fires.
 */
const ATTEMPTS: { extra: string[]; restricted: boolean }[] = [
  { extra: [], restricted: false },
  { extra: ["--extractor-args", "youtube:player_client=android"], restricted: true },
];

type Active = { id: string; child: ChildProcess | null; cancelled: boolean; dir: string };
let active: Active | null = null;

/**
 * The yt-dlp binaries are PyInstaller one-file builds: the executable we spawn
 * is a bootloader that runs the real program as a child process. Killing only
 * the parent leaves that child (and any ffmpeg it started) downloading away,
 * so the whole tree has to go.
 */
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    // Spawned detached, so the pid is also a process group id.
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

export function cancelDownload(): void {
  if (!active) return;
  active.cancelled = true;
  if (active.child) killTree(active.child);
}

/**
 * yt-dlp writes `.part` files plus the separate video and audio streams before
 * merging, so it works in a scratch folder beside the destination and only the
 * finished file is moved into place. Same volume, so the move is a rename.
 */
async function runAttempt(
  state: Active,
  req: DownloadRequest,
  extra: string[],
  onProgress: (p: Progress) => void,
): Promise<{ ok: boolean; stderr: string }> {
  const { format, audioOnly } = formatSelector(req.quality);
  const args = [
    ...baseArgs(),
    ...extra,
    "-f",
    format,
    ...(audioOnly ? ["--extract-audio", "--audio-format", "m4a"] : ["--merge-output-format", "mp4"]),
    "-o",
    path.join(state.dir, "%(title).150B [%(id)s].%(ext)s"),
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
    req.url,
  ];

  const progress: Progress = { id: state.id, status: "downloading", percent: 0, speed: null, eta: null };

  return new Promise((resolve) => {
    // `detached` puts the child in its own process group on POSIX so killTree
    // can take the whole group down; it has no effect on Windows.
    const child = spawn(binary(), args, { windowsHide: true, detached: process.platform !== "win32" });
    state.child = child;
    let stderr = "";
    let buffer = "";

    const consume = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = parseProgressLine(raw.trim());
        if (!line) continue;
        if (line.kind === "merging") {
          progress.status = "merging";
          progress.percent = 100;
          progress.speed = null;
          progress.eta = null;
        } else {
          // Video and audio are fetched as separate files, so yt-dlp's percentage
          // restarts at 0 for the second one. Only ever move forwards; the audio
          // stream is a rounding error next to the video.
          if (line.percent !== null) progress.percent = Math.max(progress.percent, line.percent);
          progress.speed = line.speed;
          progress.eta = line.eta;
          progress.status = "downloading";
        }
        onProgress({ ...progress });
      }
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

/** Pick what yt-dlp produced: after a merge there is one file, otherwise the largest. */
async function pickOutput(dir: string): Promise<{ file: string; size: number } | null> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  const files = entries.filter((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
  let picked: { file: string; size: number } | null = null;
  for (const f of files) {
    const s = await stat(path.join(dir, f)).catch(() => null);
    if (s && (!picked || s.size > picked.size)) picked = { file: f, size: s.size };
  }
  return picked;
}

/** "Name.mp4" → "Name (2).mp4" until it no longer collides. */
function freeName(dir: string, filename: string): string {
  const ext = path.extname(filename);
  const stem = filename.slice(0, -ext.length || undefined);
  let candidate = filename;
  for (let n = 2; existsSync(path.join(dir, candidate)); n += 1) {
    candidate = `${stem} (${n})${ext}`;
  }
  return candidate;
}

export async function startDownload(
  req: DownloadRequest,
  onProgress: (p: Progress) => void,
): Promise<DownloadResult> {
  if (active) throw new Error("A download is already running.");
  // Fail before touching disk if the binary is gone.
  binary();

  const { downloadDir } = getSettings();
  const id = randomUUID();
  const state: Active = { id, child: null, cancelled: false, dir: path.join(downloadDir, `.dragon-${id}`) };
  active = state;

  const result: DownloadResult = {
    id,
    status: "error",
    filePath: null,
    filename: null,
    size: null,
    restricted: false,
    error: null,
  };

  try {
    await mkdir(state.dir, { recursive: true });
    let lastError = "";

    for (const attempt of ATTEMPTS) {
      onProgress({ id, status: "downloading", percent: 0, speed: null, eta: null });
      const { ok, stderr } = await runAttempt(state, req, attempt.extra, onProgress);

      if (state.cancelled) {
        result.status = "cancelled";
        return result;
      }

      const output = ok ? await pickOutput(state.dir) : null;
      if (output) {
        const filename = freeName(downloadDir, output.file);
        const filePath = path.join(downloadDir, filename);
        await rename(path.join(state.dir, output.file), filePath);
        Object.assign(result, {
          status: "done",
          filePath,
          filename,
          size: output.size,
          restricted: attempt.restricted,
        });
        onProgress({ id, status: "done", percent: 100, speed: null, eta: null });
        return result;
      }

      lastError = stderr || lastError;
      // Only the gate is worth a second, lower-quality try.
      if (!isGated(stderr)) break;
      await rm(state.dir, { recursive: true, force: true }).catch(() => {});
      await mkdir(state.dir, { recursive: true });
    }

    result.error = explain(cleanError(lastError) || "yt-dlp could not download this video.");
    onProgress({ id, status: "error", percent: 0, speed: null, eta: null });
    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : "Download failed.";
    return result;
  } finally {
    // Right after a kill, Windows can still hold the .part files for a moment.
    await rm(state.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    active = null;
  }
}

// ---------------------------------------------------------------------------
// Thumbnail

const THUMB_HOSTS = new Set(["i.ytimg.com", "img.youtube.com", "i9.ytimg.com", "yt3.ggpht.com"]);

export async function saveThumbnail(src: string, title: string): Promise<string> {
  const target = new URL(src);
  if (target.protocol !== "https:" || !THUMB_HOSTS.has(target.hostname)) {
    throw new Error("Only YouTube thumbnails can be saved.");
  }
  const res = await fetch(target);
  if (!res.ok) throw new Error("Could not fetch that thumbnail.");

  const { downloadDir } = getSettings();
  await mkdir(downloadDir, { recursive: true });
  const ext = target.pathname.endsWith(".webp") ? "webp" : "jpg";
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 120) || "thumbnail";
  const filePath = path.join(downloadDir, freeName(downloadDir, `${safe}.${ext}`));
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}
