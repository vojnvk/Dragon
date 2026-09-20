# Dragon

A desktop YouTube downloader for Windows and macOS. Paste a link — anywhere in
the window — and get the video in the highest available quality, the thumbnail,
and a one-click copy of the title. Files land straight in your download folder.

Built with Electron and Next.js. `yt-dlp` and `ffmpeg` ship inside the app, so
there is nothing to install.

## Develop

```bash
npm install        # also fetches the yt-dlp nightly into ./bin
npm run dev        # next dev + Electron with live reload
npm test           # unit tests for the yt-dlp parsing/args logic
```

`npm run dev` starts Next.js on :3000 and opens the Electron window against it.
Edits to `app/` hot-reload; edits to `electron/` need a restart.

## Build installers

```bash
npm run dist:win   # release/Dragon-<version>-win-x64.exe (NSIS) + portable .exe
npm run dist:mac   # release/Dragon-<version>-mac-<arch>.dmg (arch of the building Mac)
```

Each platform builds on itself: the Windows build needs Windows, the macOS
build needs a Mac (the bundled `ffmpeg` and `yt-dlp` are platform binaries and
the DMG is a macOS format).

**macOS is unsigned.** Without an Apple Developer account there is no
signature or notarization, so Gatekeeper refuses the first launch. Either
right-click the app → *Open*, or run:

```bash
xattr -dr com.apple.quarantine /Applications/Dragon.app
```

To sign it later, set `identity` in `electron-builder.yml` and add
`CSC_LINK` / `CSC_KEY_PASSWORD` plus notarization credentials to the
environment; nothing else needs to change.

## How it works

```
electron/            main process — owns yt-dlp, ffmpeg, settings, the window
  main.ts            frameless BrowserWindow, app:// protocol for the UI, CSP
  ipc.ts             ipcMain handlers (window controls, info, download, settings)
  preload.ts         contextBridge → window.dragon (see shared/api.ts)
  ytdlp.ts           spawn yt-dlp, parse progress, cancel, android fallback
  ytdlp-core.ts      pure helpers (tested)
  paths.ts           where the binaries are: userData/bin → resources/bin → ./bin
  settings.ts        userData/settings.json
  update.ts          in-app yt-dlp nightly update into userData/bin
app/                 Next.js UI, static export (`out/`), served over app://
shared/              types shared by main and renderer
scripts/             yt-dlp fetcher (postinstall + in-app), esbuild bundler
```

The renderer is sandboxed with context isolation; everything it can do goes
through the typed API in `shared/api.ts`. The window is frameless on both
platforms: Windows draws its own caption buttons, macOS keeps the native
traffic lights inside the custom title bar.

Downloads run in a scratch folder next to the destination
(`.dragon-<id>/`) and only the finished file is moved into place, so a cancel
never leaves `.part` files behind. Progress is mirrored to the taskbar / dock
icon and a notification fires if the window is not in front when a download
finishes.

## Keeping downloads working

YouTube changes its streaming defences constantly. A stale `yt-dlp` shows up as
`HTTP Error 403` on ordinary videos, or as a silent drop to 360p (the app tells
you when that fallback fired). **Settings → yt-dlp → Update** fetches the
current nightly build; it goes to the user data folder and takes precedence
over the copy bundled with the app, so no reinstall is needed.

For age-restricted, private, or members-only videos, point **Settings →
Cookies** at a browser or an exported `cookies.txt`. On Windows, Chromium
browsers usually fail with a DPAPI error because of app-bound cookie
encryption — use Firefox or the exported file. Some videos are DRM protected
and cannot be downloaded at all.

## Quality

"Best available" takes the top video stream plus the top audio stream and
merges them into MP4. At the top of the ladder YouTube serves AV1/Opus — the
highest quality, but not playable everywhere. Pick an explicit height like
`1080p` if you want something more broadly compatible, or *Audio only* for an
`m4a`.
