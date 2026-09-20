/**
 * Fetching a self-contained yt-dlp from the nightly channel. Shared by the
 * postinstall script (into ./bin for dev and packaging) and by the app's
 * in-app updater (into the user data directory).
 *
 * Nightly, not stable: YouTube changes its streaming defences constantly and a
 * stale binary shows up as HTTP 403s on ordinary videos. The PyInstaller builds
 * below bundle their own interpreter and need nothing on the machine.
 */
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const RELEASE = "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download";

export function assetName(platform = process.platform, arch = process.arch) {
  if (platform === "win32") return "yt-dlp.exe";
  // A universal2 binary: runs natively on Intel and Apple Silicon.
  if (platform === "darwin") return "yt-dlp_macos";
  if (arch === "arm64") return "yt-dlp_linux_aarch64";
  return "yt-dlp_linux";
}

export function binaryName(platform = process.platform) {
  return platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
}

/**
 * Download the current nightly to `target`, replacing it atomically so a running
 * download that already spawned the old binary is unaffected.
 * @param {string} target absolute path of the binary to write
 * @param {(p: { percent: number | null; message: string }) => void} [onProgress]
 */
export async function downloadYtdlp(target, onProgress = () => {}) {
  const asset = assetName();
  const url = `${RELEASE}/${asset}`;
  onProgress({ percent: null, message: `Fetching ${asset} (nightly)…` });

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);

  const total = Number(res.headers.get("content-length")) || null;
  const chunks = [];
  let received = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk);
    received += chunk.length;
    onProgress({
      percent: total ? Math.round((received / total) * 100) : null,
      message: `Downloading… ${(received / 1048576).toFixed(1)} MB`,
    });
  }

  const bytes = Buffer.concat(chunks);
  // A truncated or HTML error page would be far smaller than a real build.
  if (bytes.length < 1_000_000) throw new Error(`suspiciously small download (${bytes.length} bytes)`);

  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.download`;
  await writeFile(tmp, bytes);
  await chmod(tmp, 0o755).catch(() => {});
  await rename(tmp, target);
  onProgress({ percent: 100, message: `Installed ${(bytes.length / 1048576).toFixed(1)} MB` });
  return bytes.length;
}
