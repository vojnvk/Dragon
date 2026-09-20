/**
 * Pure yt-dlp helpers: argument building and output parsing. Nothing in here
 * touches the filesystem or spawns anything, so it is unit tested directly.
 */

export { isYouTubeUrl } from "../shared/youtube.ts";

export const CORE_ARGS = ["--no-playlist", "--no-warnings", "--ignore-config", "--no-cache-dir"];

export const PROGRESS_TEMPLATE =
  "download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

/** yt-dlp errors are noisy; surface the first meaningful line. */
export function cleanError(stderr: string): string {
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => l.startsWith("ERROR:")) ?? lines[lines.length - 1] ?? "";
  return line.replace(/^ERROR:\s*/, "").slice(0, 300);
}

/** Build a yt-dlp format selector for the requested quality. */
export function formatSelector(quality: string): { format: string; audioOnly: boolean } {
  if (quality === "audio") {
    return { format: "ba[ext=m4a]/ba/b", audioOnly: true };
  }
  if (quality === "best") {
    return { format: "bv*+ba/b", audioOnly: false };
  }
  const height = Number.parseInt(quality, 10);
  if (Number.isFinite(height) && height > 0) {
    return {
      format: `bv*[height<=${height}]+ba/b[height<=${height}]/bv*+ba/b`,
      audioOnly: false,
    };
  }
  return { format: "bv*+ba/b", audioOnly: false };
}

function num(raw: string | undefined): number | null {
  if (!raw || raw === "NA" || raw === "None") return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export function humanSpeed(bytesPerSecond: number | null): string | null {
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

export type ProgressLine =
  | { kind: "progress"; percent: number | null; speed: string | null; eta: number | null }
  | { kind: "merging" };

/**
 * Interpret one line of yt-dlp output. Progress lines come from
 * PROGRESS_TEMPLATE; the merge phase is recognised by its postprocessor tags.
 */
export function parseProgressLine(line: string): ProgressLine | null {
  if (line.startsWith("PROG|")) {
    const [, downloaded, total, estimate, speed, eta] = line.split("|");
    const have = num(downloaded);
    const want = num(total) ?? num(estimate);
    return {
      kind: "progress",
      percent: have !== null && want ? Math.min(100, (have / want) * 100) : null,
      speed: humanSpeed(num(speed)),
      eta: num(eta),
    };
  }
  if (line.includes("[Merger]") || line.includes("[ExtractAudio]") || line.includes("[VideoRemuxer]")) {
    return { kind: "merging" };
  }
  return null;
}

/** Errors worth retrying on the restricted fallback client. */
export function isGated(stderr: string): boolean {
  return /403|Forbidden|PO Token|format is not available|Sign in to confirm/i.test(stderr);
}

export function explain(message: string): string {
  if (/DRM/i.test(message)) {
    return `${message} — this video is DRM protected and cannot be downloaded.`;
  }
  if (/Sign in to confirm/i.test(message)) {
    return `${message} — YouTube wants a signed-in session. Set a cookies source in Settings.`;
  }
  if (/403|Forbidden|PO Token/i.test(message)) {
    return `${message} — a stale yt-dlp is the usual cause. Update yt-dlp in Settings and try again.`;
  }
  return message;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export type CaptionLine = { start: number; text: string };

/**
 * YouTube's json3 caption format: a list of events, each with a start time in
 * ms and text segments. Auto-captions arrive as one event per phrase, manual
 * subtitles as one per cue.
 */
export function json3ToLines(raw: string): CaptionLine[] {
  const data = JSON.parse(raw) as { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] };
  const lines: CaptionLine[] = [];
  for (const event of data.events ?? []) {
    const text = (event.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) lines.push({ start: (event.tStartMs ?? 0) / 1000, text });
  }
  return lines;
}

export function json3ToText(raw: string): string {
  return json3ToLines(raw)
    .map((l) => l.text)
    .join("\n");
}

/** "[m:ss] text" per line; hours appear only when a video is that long. */
export function linesWithTimestamps(lines: CaptionLine[]): string {
  return lines.map((l) => `[${formatDuration(l.start) || "0:00"}] ${l.text}`).join("\n");
}
