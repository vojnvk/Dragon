import { app } from "electron";
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";

const isWindows = process.platform === "win32";

export const YTDLP_NAME = isWindows ? "yt-dlp.exe" : "yt-dlp";
export const FFMPEG_NAME = isWindows ? "ffmpeg.exe" : "ffmpeg";

/**
 * macOS app bundles are read-only once installed, so an in-app update of yt-dlp
 * has to land in the per-user data directory. It takes precedence over whatever
 * shipped with the app.
 */
export function userBinDir(): string {
  return path.join(app.getPath("userData"), "bin");
}

/** Where electron-builder's `extraResources` put things, or the repo in dev. */
function bundledBinDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, "bin") : path.join(app.getAppPath(), "bin");
}

/**
 * A binary copied around by packagers or downloaded with fetch() may be missing
 * its executable bit, which shows up as a bare EACCES at spawn time.
 */
export function ensureExecutable(file: string): string {
  if (!isWindows) {
    try {
      chmodSync(file, 0o755);
    } catch {
      // Read-only location: either already executable or nothing we can do.
    }
  }
  return file;
}

export type YtdlpLocation = { path: string; userManaged: boolean } | null;

export function resolveYtdlp(): YtdlpLocation {
  const user = path.join(userBinDir(), YTDLP_NAME);
  if (existsSync(user)) return { path: ensureExecutable(user), userManaged: true };

  const bundled = path.join(bundledBinDir(), YTDLP_NAME);
  if (existsSync(bundled)) return { path: ensureExecutable(bundled), userManaged: false };

  return null;
}

/**
 * yt-dlp shells out to ffmpeg to merge the separate video and audio streams
 * YouTube serves above 360p. Packaged builds carry the `ffmpeg-static` binary
 * in resources; in dev it is read straight from node_modules.
 */
export function resolveFfmpeg(): string | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "bin", FFMPEG_NAME)]
    : [
        path.join(app.getAppPath(), "node_modules", "ffmpeg-static", FFMPEG_NAME),
        path.join(app.getAppPath(), "bin", FFMPEG_NAME),
      ];
  for (const file of candidates) {
    if (existsSync(file)) return ensureExecutable(file);
  }
  return null;
}
