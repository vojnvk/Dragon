import path from "node:path";
import type { UpdateProgress, YtdlpStatus } from "../shared/api";
import { YTDLP_NAME, resolveYtdlp, userBinDir } from "./paths";
import { ytdlpVersion } from "./ytdlp";
// Plain ESM shared with the postinstall script; esbuild bundles it in.
import { downloadYtdlp } from "../scripts/ytdlp-release.mjs";

export async function ytdlpStatus(): Promise<YtdlpStatus> {
  const found = resolveYtdlp();
  return {
    path: found?.path ?? null,
    version: await ytdlpVersion(),
    userManaged: found?.userManaged ?? false,
  };
}

let running: Promise<YtdlpStatus> | null = null;

/** Fetch the current nightly into the user data directory. Idempotent while running. */
export function updateYtdlp(onProgress: (p: UpdateProgress) => void): Promise<YtdlpStatus> {
  if (running) return running;
  // The fetch reports every chunk; the renderer only needs visible changes.
  let lastPercent = -1;
  let lastAt = 0;
  const throttled = (p: UpdateProgress) => {
    const now = Date.now();
    if (p.percent === lastPercent && now - lastAt < 150 && p.percent !== 100) return;
    lastPercent = p.percent ?? -1;
    lastAt = now;
    onProgress(p);
  };
  running = downloadYtdlp(path.join(userBinDir(), YTDLP_NAME), throttled)
    .then(ytdlpStatus)
    .finally(() => {
      running = null;
    });
  return running;
}
