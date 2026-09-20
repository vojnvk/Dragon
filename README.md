# Dragon — easy YouTube downloader

**Paste a link. Get the video.** Dragon is a free, open-source YouTube
downloader for **Windows and macOS** with a clean dark UI and zero setup —
`yt-dlp` and `ffmpeg` are bundled, so there is nothing else to install.

- **Best quality** — 4K / 1080p / 720p or any height, merged to MP4
- **Audio only** — grab the soundtrack as `m4a`
- **Thumbnail + title** — save the cover image, copy the title in one click
- **Paste anywhere** — Ctrl/⌘+V in the window and it looks the link up
- **Straight to disk** — files land in your download folder, with progress in
  the taskbar / dock, cancel, and *Show in folder*
- **Stays working** — one-click `yt-dlp` update inside the app when YouTube
  changes something
- **No ads, no accounts, no telemetry** — MIT licensed

<p align="center">
  <img src="docs/screenshot.png" alt="Dragon desktop app — YouTube video downloaded in 1080p" width="720">
</p>

## Download

Grab the latest build from the **[Releases page](https://github.com/vojnvk/Dragon/releases/latest)**:

| Platform | File |
| --- | --- |
| Windows 10 / 11 | `Dragon-<version>-win-x64.exe` (installer) or `Dragon-<version>-portable.exe` |
| macOS (Apple Silicon) | `Dragon-<version>-mac-arm64.dmg` |
| macOS (Intel) | `Dragon-<version>-mac-x64.dmg` |

> **macOS:** the app is not notarized (no Apple Developer account), so the
> first launch is blocked by Gatekeeper. Right-click the app → **Open**, or run
> `xattr -dr com.apple.quarantine /Applications/Dragon.app` once.
>
> **Windows:** SmartScreen may warn about an unknown publisher for the same
> reason — choose *More info → Run anyway*.

## This repository

Two apps share this repo. They are independent — each has its own
`package.json` and `README`:

| Folder | What | Use it when |
| --- | --- | --- |
| [`desktop/`](desktop) | **Electron app** for Windows & macOS. Frameless window with a custom title bar, native dialogs and notifications, in-app `yt-dlp` updates. | You want to download videos on your own computer. **This is the one to download.** |
| [`web/`](web) | **Next.js web app** — the original version with API routes. Runs locally in a browser or deploys to Vercel (with real limits, see its README). | You want to self-host a downloader or hack on the web version. |

```
desktop/   Electron + Next.js (static export)   → npm run dev · npm run dist
web/       Next.js with API routes              → npm run dev · vercel deploy
docs/      design notes and the screenshot above
.github/   CI + release workflow (builds the installers on tag push)
```

## Build it yourself

```bash
# Desktop app
cd desktop
npm install          # also fetches the current yt-dlp nightly
npm run dev          # live-reload development window
npm run dist         # installer for the platform you are on → desktop/release/

# Web app
cd web
npm install
npm run dev          # http://localhost:3000
```

## Releasing

Bump `version` in `desktop/package.json`, then push a matching tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

GitHub Actions builds the Windows installer and both macOS DMGs and attaches
them to the release automatically (`.github/workflows/release.yml`).

## Troubleshooting

- **`HTTP Error 403` or the download silently drops to 360p** → YouTube
  changed something. *Settings → yt-dlp → Update*. This fixes it nearly every
  time.
- **Age-restricted / private / members-only video** → *Settings → Cookies*,
  pick your browser or an exported `cookies.txt`. On Windows prefer Firefox;
  Chromium browsers usually fail with a DPAPI error.
- **DRM protected** → cannot be downloaded by any tool.

## Legal

Downloading videos may violate YouTube's Terms of Service and the rights of
content owners. Dragon is a tool for personal use — for your own content, for
content you have permission to download, or where your local law allows it.
You are responsible for how you use it.

## License

[MIT](LICENSE)

---

<sub>Keywords: youtube downloader, easy youtube downloader, free youtube
downloader, youtube video downloader windows, youtube downloader mac, yt-dlp
gui, yt-dlp desktop app, download youtube video 4k 1080p, youtube to mp4,
youtube to m4a, youtube thumbnail downloader, electron youtube downloader,
open source youtube downloader.</sub>
