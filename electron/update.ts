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
  running = downloadYtdlp(path.join(userBinDir(), YTDLP_NAME), onProgress)
    .then(ytdlpStatus)
    .finally(() => {
      running = null;
    });
  return running;
}
