#!/usr/bin/env node
/**
 * Fetch a self-contained yt-dlp into ./bin, tracking the nightly channel.
 *
 * Two problems this solves:
 *
 * 1. `youtube-dl-exec` installs the *Python zipapp* build on Linux, which
 *    starts with `#!/usr/bin/env python3`. Vercel's Node runtime has no Python,
 *    so it dies with `env: 'python3': No such file or directory`. The
 *    PyInstaller builds below bundle their own interpreter and need nothing.
 *
 * 2. It also pins whichever yt-dlp *stable* release was current when it was
 *    published, which drifts weeks behind. YouTube changes its streaming
 *    defences constantly and a stale binary shows up as HTTP 403s on ordinary
 *    videos, so this tracks nightly instead.
 *
 * Runs on postinstall and via `npm run update-ytdlp`. Never fails the install —
 * a network hiccup here should not block `npm install`.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RELEASE = "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download";

function assetName() {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  if (process.arch === "arm64") return "yt-dlp_linux_aarch64";
  return "yt-dlp_linux";
}

export function binaryPath() {
  const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return path.join(process.cwd(), "bin", name);
}

async function main() {
  const target = binaryPath();
  const url = `${RELEASE}/${assetName()}`;

  console.log(`[update-ytdlp] fetching ${assetName()} (nightly)`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const bytes = Buffer.from(await res.arrayBuffer());
  // A truncated or HTML error page would be far smaller than a real build.
  if (bytes.length < 1_000_000) throw new Error(`suspiciously small (${bytes.length} bytes)`);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  await chmod(target, 0o755).catch(() => {});
  console.log(`[update-ytdlp] wrote ${target} (${(bytes.length / 1048576).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.log(`[update-ytdlp] skipped: ${e.message}`);
  process.exit(0);
});
