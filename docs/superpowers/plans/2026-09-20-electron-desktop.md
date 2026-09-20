# Electron Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Dragon as a frameless, custom-title-bar Electron app for Windows and macOS, with all yt-dlp work in the main process and the Next.js UI as a static export.

**Architecture:** Electron main owns yt-dlp/ffmpeg (spawn, progress, cancel, settings, in-app yt-dlp update) and exposes a typed API through a preload `contextBridge`. The renderer is the existing Next.js page adapted to `window.dragon`, served from `out/` over a custom `app://` protocol in production and from `next dev` in development. electron-builder packages per platform with binaries in `extraResources`.

**Tech Stack:** Next.js 16 (static export), React 19, Tailwind 4, Electron 44, esbuild, electron-builder 26, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-20-electron-desktop-design.md`

## Global Constraints

- Renderer: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Window: `frame: false` everywhere; macOS `titleBarStyle: "hidden"` + `trafficLightPosition`.
- Binaries never inside asar; resolved via `process.resourcesPath/bin` when packaged.
- Colors stay: bg `#0b0b0f`, accent `#ff2d55`.
- No Vercel/Blob/API routes remain.

---

### Task 1: Shared API types + pure yt-dlp logic with tests

**Files:**
- Create: `shared/api.ts` — `VideoInfo`, `Quality`, `Progress`, `DownloadRequest`, `DownloadResult`, `Settings`, `DragonApi` (the `window.dragon` shape)
- Create: `electron/ytdlp-core.ts` — pure functions moved from `lib/ytdlp.ts` + `app/api/download/route.ts`: `isYouTubeUrl`, `cleanError`, `formatSelector`, `parseProgressLine`, `humanSpeed`, `isGated`, `explain`, `PROGRESS_TEMPLATE`
- Test: `electron/ytdlp-core.test.ts` (run with `node --experimental-strip-types --test`)

**Steps:**
- [ ] Write tests: URL validation (youtu.be, music, invalid), `formatSelector("audio"|"best"|"1080")`, `parseProgressLine("PROG|50|100|NA|1048576|12")` → `{percent:50, speed:"1.0 MB/s", eta:12}`, merger line → `{status:"merging"}`, `cleanError` picks first `ERROR:` line.
- [ ] Run → fail (module missing).
- [ ] Implement `ytdlp-core.ts`.
- [ ] Run → pass. Commit.

### Task 2: Electron main: binaries, settings, download engine

**Files:**
- Create: `electron/paths.ts` — `resolveYtdlp()`, `resolveFfmpeg()`, `userBinDir()`
- Create: `electron/settings.ts` — `getSettings()`, `setSettings(patch)`; JSON in `userData/settings.json`; defaults `{ downloadDir: ~/Downloads/Dragon, cookiesFromBrowser: "", cookiesFile: "" }`
- Create: `electron/ytdlp.ts` — `fetchInfo(url)`, `startDownload(req, onProgress) → {cancel, done: Promise<DownloadResult>}`, `saveThumbnail(url, title, dir)`, `ytdlpVersion()`
- Create: `electron/update.ts` — `updateYtdlp(onProgress)` fetching nightly into `userBinDir()`; `scripts/update-ytdlp.mjs` keeps the dev/postinstall copy.

**Interfaces:** `startDownload` writes into `settings.downloadDir` with output template `%(title).150B [%(id)s].%(ext)s`; progress callback receives `Progress` from `shared/api.ts`.

- [ ] Implement each module. Android fallback + `.part` cleanup on cancel.
- [ ] Commit.

### Task 3: Electron window, protocol, IPC, preload

**Files:**
- Create: `electron/main.ts` — single-instance lock, `protocol.registerSchemesAsPrivileged([{scheme:"app", privileges:{standard:true, secure:true, supportFetchAPI:true}}])`, `protocol.handle("app", …)` serving `out/`, `BrowserWindow` per spec, `setProgressBar`, `Notification`, deny `window.open`, `shell.openExternal` for external links, `window:maximized` events.
- Create: `electron/ipc.ts` — handlers: `window:minimize|maximize|close|isMaximized`, `info`, `download:start|cancel`, `thumb:save`, `shell:showItem|openDir|openExternal`, `settings:get|set|chooseDir`, `ytdlp:version|update`, `platform`.
- Create: `electron/preload.ts` — `contextBridge.exposeInMainWorld("dragon", api)` implementing `DragonApi`; progress via `ipcRenderer.on`.

- [ ] Implement. Commit.

### Task 4: Build tooling

**Files:**
- Modify: `package.json` — deps: remove `@vercel/blob`, `youtube-dl-exec`; add `electron`, `electron-builder`, `esbuild`, `concurrently`, `wait-on`, `cross-env`; `main: dist-electron/main.js`; scripts `dev`, `build`, `build:electron`, `dist`, `dist:win`, `dist:mac`, `test`.
- Create: `scripts/build-electron.mjs` — esbuild main+preload → `dist-electron/` (cjs, platform node, external electron, `--watch` flag).
- Create: `electron-builder.yml` — appId `dev.dragon.app`, `files: [dist-electron/**, out/**, package.json]`, `extraResources: bin/** → bin/`, ffmpeg-static binary → `bin/`, win `nsis`+`portable`, mac `dmg` arm64+x64, `hardenedRuntime:false`, `identity:null`.
- Modify: `next.config.ts` — `output: "export"`, `images.unoptimized`, remove tracing.
- Modify: `tsconfig.json` — include `electron/**`, `shared/**`; exclude tests from Next type-check if needed.
- Modify: `.gitignore` — `dist-electron/`, `release/`.
- Delete: `app/api/**`, `lib/**`.

- [ ] Install, wire scripts, ensure `npm run build` produces `out/` and `dist-electron/`. Commit.

### Task 5: Renderer: title bar + app UI on `window.dragon`

**Files:**
- Create: `app/components/TitleBar.tsx` — drag region, logo, Windows controls (min/max/close, swaps icon on maximized), mac left padding for traffic lights.
- Create: `app/components/icons.tsx` — small inline SVGs.
- Create: `app/lib/dragon.ts` — typed accessor `dragon()` returning `window.dragon`, with `declare global`.
- Modify: `app/page.tsx` — replace fetch/SSE with `dragon().info()` / `dragon().download()` + progress subscription; cancel button; Show in folder; destination folder row; settings sheet; yt-dlp version + update; paste-anywhere.
- Modify: `app/layout.tsx` — mount `TitleBar`, `overflow-hidden` frame with rounded body.
- Modify: `app/globals.css` — title bar tokens, `-webkit-app-region`, no text select on chrome, progress animation.

- [ ] Implement. `npm run dev` → window shows, fetch works, download to folder with progress, cancel, show in folder, settings, update yt-dlp, title bar buttons.
- [ ] Commit.

### Task 6: Packaging + docs

- [ ] `npm run dist:win` → `release/` installer; launch it, download a video.
- [ ] Rewrite `README.md` for the desktop app (dev, build, mac unsigned note, update yt-dlp).
- [ ] Commit.
