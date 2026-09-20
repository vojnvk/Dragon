# Dragon desktop

Electron app. The UI is a Next.js static export served over a custom `app://`
protocol; yt-dlp runs in the main process and the renderer talks to it through
`window.dragon` (see `shared/api.ts`).

## Run

Needs Node 24 and npm 11.10 or newer (`npm i -g npm`). Older npm writes a
lockfile that CI's npm rejects, so it's refused outright.

```
npm install      # also downloads the yt-dlp nightly into ./bin
npm run dev      # next dev on :3000 + Electron pointed at it
npm test
```

Changes in `app/` hot-reload. Changes in `electron/` need a restart.

## Build an installer

```
npm run dist:win     # release/Dragon-<version>-win-x64.exe and -portable.exe
npm run dist:mac     # release/Dragon-<version>-mac-<arch>.dmg
```

You need Windows for the Windows build and a Mac for the Mac build; the
bundled ffmpeg is a native binary and the DMG is a Mac format. A Mac builds for
its own architecture only. The release workflow in `.github/workflows` builds
all three.

Mac builds are unsigned; `scripts/adhoc-sign-mac.mjs` only re-signs the packed
bundle ad-hoc, because without a valid signature macOS calls the app damaged
rather than merely unsigned. To sign for real, set `identity` in
`electron-builder.yml` and provide `CSC_LINK` / `CSC_KEY_PASSWORD`.

## Layout

```
electron/main.ts        window, app:// protocol, CSP, single instance
electron/ipc.ts         ipcMain handlers
electron/preload.ts     contextBridge
electron/ytdlp.ts       spawn yt-dlp, parse progress, cancel, fallback client
electron/ytdlp-core.ts  pure helpers, unit tested
electron/paths.ts       binary lookup: userData/bin, then resources/bin, then ./bin
electron/settings.ts    userData/settings.json
electron/update.ts      in-app yt-dlp update
app/                    Next.js UI
shared/                 types used on both sides
scripts/                yt-dlp fetch, esbuild
```

## Notes

- Downloads go into `<download folder>/.dragon-<id>/` and the finished file is
  renamed into place, so cancelling leaves nothing behind.
- yt-dlp's binaries are PyInstaller one-file builds: the process you spawn is a
  bootloader with a child. Cancel kills the whole tree (`taskkill /T` on
  Windows, process group on POSIX) or the child keeps downloading.
- An in-app yt-dlp update goes to `userData/bin` and wins over the bundled
  copy. The app bundle is read-only on macOS, so that's the only place it can
  go.
