# Dragon → Electron desktop app

Date: 2026-09-20

## Goal

Turn the Next.js YouTube downloader into a single, polished desktop application
for Windows and macOS. The web/Vercel deployment is dropped: Next.js remains
only as the UI layer (static export); all yt-dlp work moves into the Electron
main process and is reached over IPC.

## Non-goals

- Hosting / Vercel / Blob support (removed).
- App auto-update (needs release infrastructure; can come later).
- macOS code signing / notarization (no Apple developer account available;
  the build must still produce a working unsigned DMG).

## Architecture

```
electron/
  main.ts       BrowserWindow, app:// protocol, single-instance lock, lifecycle
  preload.ts    contextBridge → window.dragon (typed API)
  ipc.ts        ipcMain handlers, thin layer over ytdlp.ts / settings.ts
  ytdlp.ts      binary resolution, args, info, download with progress, cancel
  settings.ts   JSON settings in app.getPath("userData")/settings.json
  update.ts     fetch yt-dlp nightly into userData/bin
app/            Next.js UI, output: "export" → out/
shared/
  api.ts        types shared by preload and renderer (VideoInfo, Progress, ...)
```

- Renderer runs with `contextIsolation: true`, `sandbox: true`, `nodeIntegration:
  false`. Everything crosses via `window.dragon`.
- **Production:** `protocol.handle("app", …)` serves files from `out/` so the
  absolute `/_next/...` asset paths work. Window loads `app://-/index.html`.
- **Dev:** `next dev` on :3000; Electron loads `http://localhost:3000`.
- `app/api/*`, `lib/jobs.ts`, `lib/mime.ts`, `@vercel/blob`, and the Vercel
  notes in README/next.config are removed. `lib/ytdlp.ts` logic moves to
  `electron/ytdlp.ts`.

## Binaries

Resolution order for yt-dlp: `userData/bin/yt-dlp[.exe]` (in-app update) →
`process.resourcesPath/bin/yt-dlp[.exe]` (packaged) → `./bin` (dev) →
`node_modules/youtube-dl-exec/bin` → PATH.

ffmpeg: `process.resourcesPath/bin/ffmpeg[.exe]` (packaged) →
`node_modules/ffmpeg-static/ffmpeg[.exe]` (dev). Both are copied into
`extraResources` (outside asar) by electron-builder so they can be spawned.
Each platform builds on itself; macOS builds run on a Mac.

`scripts/update-ytdlp.mjs` keeps fetching nightly into `./bin` on postinstall
for dev/packaging. The same download logic is reused by `electron/update.ts` to
refresh into `userData/bin` at runtime.

## Downloading

- Files are written **directly into the destination folder** (default
  `~/Downloads/Dragon`, changeable in settings via native folder dialog).
- Progress (`downloading | merging | done | error`, percent, speed, eta) is
  pushed to the renderer via `webContents.send("download:progress", …)` and
  mirrored to `win.setProgressBar()` (taskbar/dock).
- `cancel` kills the yt-dlp process and removes `.part` / `.ytdl` leftovers.
- Android-client fallback kept as before (restricted → UI warns).
- Thumbnail download: main fetches the image and writes it next to the video
  (or via save dialog) — no proxy route.
- On done: **Show in folder** (`shell.showItemInFolder`), a native
  `Notification` when the window is not focused.
- Cookies: settings expose `cookiesFromBrowser` (none/firefox/chrome/edge/
  brave) and an optional cookies.txt path for age-restricted videos.

## Window & title bar

- `frame: false` on both platforms, `backgroundColor: #0b0b0f`.
- **Windows:** custom 38px bar: logo + title left, minimize / maximize-restore /
  close right, driven by IPC (`window:minimize|maximize|close`) and a
  `window:maximized` event to swap the icon. Bar is `-webkit-app-region: drag`,
  buttons `no-drag`.
- **macOS:** `titleBarStyle: "hidden"`, `trafficLightPosition: {x: 14, y: 12}`,
  the bar leaves space on the left for the native traffic lights and shows no
  custom buttons. Double-click on the bar follows the system preference
  (Electron default).
- External links open with `shell.openExternal`; `window.open` is denied.
- Single-instance lock: a second launch focuses the existing window.

## UI

`app/page.tsx` remains the base, adapted to `window.dragon` and polished:
title bar component, paste anywhere (Ctrl/Cmd+V with a YouTube URL fills the
field and fetches), cancel button, destination folder shown with "change" and
"open", Show in folder, settings sheet (folder, cookies), yt-dlp version +
"Update yt-dlp" button, subtle progress animation, empty state.

## Build & packaging

- `esbuild` bundles `electron/main.ts` and `electron/preload.ts` → `dist-electron/`
  (CommonJS, platform node, external `electron`).
- Scripts: `dev` (next dev + wait-on + electron), `build` (next build + esbuild),
  `dist` (build + electron-builder), `dist:win`, `dist:mac`.
- Targets: Windows NSIS + portable (x64); macOS DMG (arm64 + x64), category
  `public.app-category.utilities`, `hardenedRuntime` off (unsigned).
- `extraResources`: `bin/**` and the ffmpeg-static binary → `resources/bin/`.
- `asarUnpack` not required since binaries live in extraResources.

## Testing

- `node --test` unit tests for pure logic in `electron/ytdlp.ts` (progress line
  parsing, format selector, URL validation, error cleaning).
- Manual: `npm run dev` on Windows — fetch info, download 1080p, cancel, show in
  folder, settings, update yt-dlp, title bar buttons. `npm run dist:win` produces
  an installer that launches and downloads.
- macOS is verified by reading only: platform branches are kept minimal and use
  documented Electron APIs.
