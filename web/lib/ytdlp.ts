import { spawn } from "node:child_process";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * yt-dlp ships with the `youtube-dl-exec` dependency, so the app works with no
 * global install. If that binary is missing we fall back to whatever is on PATH.
 */
const isWindows = process.platform === "win32";

/**
 * Serverless bundlers occasionally drop the executable bit when they copy a
 * binary out of node_modules, which surfaces as a bare EACCES at spawn time.
 */
function ensureExecutable(file: string): string {
  if (!isWindows) {
    try {
      chmodSync(file, 0o755);
    } catch {
      // Read-only filesystem: the bit is either already set or nothing we can do.
    }
  }
  return file;
}

function resolveVendored(pkg: string, name: string, fallback: string): string {
  const file = path.join(process.cwd(), "node_modules", pkg, name);
  return existsSync(file) ? ensureExecutable(file) : fallback;
}

/**
 * `scripts/update-ytdlp.mjs` puts a self-contained build in ./bin. Fall back to
 * whatever `youtube-dl-exec` vendored, then to PATH — but note that its Linux
 * build is a Python zipapp, which will not run where there is no interpreter.
 */
function resolveYtdlp(): string {
  const name = isWindows ? "yt-dlp.exe" : "yt-dlp";
  const own = path.join(process.cwd(), "bin", name);
  if (existsSync(own)) return ensureExecutable(own);
  return resolveVendored(path.join("youtube-dl-exec", "bin"), name, "yt-dlp");
}

export const YTDLP = resolveYtdlp();

/**
 * yt-dlp shells out to ffmpeg to merge the separate video and audio streams
 * YouTube serves above 360p. `ffmpeg-static` vendors a build for the deploy
 * platform so this works on Vercel, where no system ffmpeg exists.
 */
export const FFMPEG = resolveVendored("ffmpeg-static", isWindows ? "ffmpeg.exe" : "ffmpeg", "");

function ffmpegArgs(): string[] {
  return FFMPEG ? ["--ffmpeg-location", FFMPEG] : [];
}

const CORE_ARGS = ["--no-playlist", "--no-warnings", "--ignore-config", "--no-cache-dir"];

/**
 * A signed-in session is what gets past "Sign in to confirm you're not a bot",
 * which YouTube serves to datacenter IPs — so this is the difference between a
 * hosted deployment working and not. Three ways in, most portable first:
 *
 *   YTDLP_COOKIES              cookies.txt contents, base64 or raw (hosted)
 *   YTDLP_COOKIES_FILE         path to a cookies.txt on disk (local)
 *   YTDLP_COOKIES_FROM_BROWSER chrome|firefox|edge|brave (local only)
 */
function cookieArgs(): string[] {
  const inline = process.env.YTDLP_COOKIES?.trim();
  if (inline) {
    const target = writeInlineCookies(inline);
    if (target) return ["--cookies", target];
  }
  const file = process.env.YTDLP_COOKIES_FILE?.trim();
  if (file) return ["--cookies", file];
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ["--cookies-from-browser", browser];
  return [];
}

/**
 * Netscape cookie files are multi-line and tab-delimited, which survives an
 * environment variable poorly, so base64 is accepted too. yt-dlp also rewrites
 * this file as cookies refresh, so it has to live somewhere writable — on a
 * serverless host only the temp directory qualifies.
 */
function writeInlineCookies(value: string): string | null {
  const target = path.join(os.tmpdir(), "dragon-cookies.txt");
  if (existsSync(target)) return target;

  const looksRaw = value.includes("\t") || value.includes("# Netscape");
  const text = looksRaw ? value : Buffer.from(value, "base64").toString("utf8");
  if (!text.includes("\t")) {
    console.warn("[dragon] YTDLP_COOKIES is not a valid Netscape cookies.txt — ignoring.");
    return null;
  }

  try {
    writeFileSync(target, text.endsWith("\n") ? text : `${text}\n`, { mode: 0o600 });
    return target;
  } catch (e) {
    console.warn(`[dragon] could not stage cookies: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** A residential proxy is the other way past datacenter-IP blocking. */
function proxyArgs(): string[] {
  const proxy = process.env.YTDLP_PROXY?.trim();
  return proxy ? ["--proxy", proxy] : [];
}

export function baseArgs(): string[] {
  return [...CORE_ARGS, ...ffmpegArgs(), ...proxyArgs(), ...cookieArgs()];
}

export function isYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    return (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    );
  } catch {
    return false;
  }
}

/** Run yt-dlp and buffer stdout. Used for metadata only. */
export function runYtdlp(args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [...baseArgs(), ...args], { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
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
      else reject(new Error(cleanError(err) || `yt-dlp exited with code ${code}`));
    });
  });
}

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
