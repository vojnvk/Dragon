import { BrowserWindow, Notification, dialog, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import type { DownloadRequest, Progress, Settings } from "../shared/api";
import { getSettings, setSettings } from "./settings";
import { updateYtdlp, ytdlpStatus } from "./update";
import { cancelDownload, fetchInfo, fetchTranscript, saveThumbnail, startDownload } from "./ytdlp";
import { isYouTubeUrl } from "./ytdlp-core";

function requireYouTube(url: unknown): string {
  const value = typeof url === "string" ? url.trim() : "";
  if (!isYouTubeUrl(value)) throw new Error("That doesn't look like a YouTube link.");
  return value;
}

/** Only ever open http(s) links in the system browser; anything else is refused. */
function requireWebUrl(url: unknown): string {
  const value = typeof url === "string" ? url : "";
  if (!/^https?:\/\//i.test(value)) throw new Error("Refusing to open a non-web URL.");
  return value;
}

/**
 * Registered once for the app's lifetime; the window is looked up per call
 * because macOS re-creates it after the last one is closed.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const target = (e: { sender: Electron.WebContents }) =>
    BrowserWindow.fromWebContents(e.sender) ?? getWindow();

  // -- window chrome ---------------------------------------------------------
  ipcMain.on("window:minimize", (e) => target(e)?.minimize());
  ipcMain.on("window:toggleMaximize", (e) => {
    const win = target(e);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window:close", (e) => target(e)?.close());
  ipcMain.handle("window:isMaximized", (e) => target(e)?.isMaximized() ?? false);

  // -- yt-dlp ------------------------------------------------------------------
  ipcMain.handle("info", (_e, url: unknown) => fetchInfo(requireYouTube(url)));

  ipcMain.handle("download:start", async (e, raw: DownloadRequest) => {
    const win = target(e);
    if (!win) throw new Error("No window.");
    const req: DownloadRequest = {
      url: requireYouTube(raw?.url),
      quality: typeof raw?.quality === "string" ? raw.quality : "best",
      title: typeof raw?.title === "string" ? raw.title : "",
    };
    await mkdir(getSettings().downloadDir, { recursive: true });

    const onProgress = (p: Progress) => {
      if (win.isDestroyed()) return;
      win.webContents.send("download:progress", p);
      // Mirror into the taskbar / dock icon.
      if (p.status === "downloading") win.setProgressBar(Math.max(0.01, p.percent / 100));
      else if (p.status === "merging") win.setProgressBar(1, { mode: "indeterminate" });
      else win.setProgressBar(-1);
    };

    try {
      const result = await startDownload(req, onProgress);
      if (result.status === "done" && !win.isFocused() && Notification.isSupported()) {
        const n = new Notification({
          title: "Download finished",
          body: result.filename ?? req.title,
          silent: false,
        });
        n.on("click", () => {
          if (result.filePath) shell.showItemInFolder(result.filePath);
          win.show();
        });
        n.show();
      }
      return result;
    } finally {
      if (!win.isDestroyed()) win.setProgressBar(-1);
    }
  });

  ipcMain.handle("download:cancel", () => cancelDownload());

  ipcMain.handle("transcript", (_e, url: unknown, lang: unknown) => {
    // The language goes into a yt-dlp argument; keep it to a BCP 47-ish tag.
    const code = typeof lang === "string" && /^[a-zA-Z0-9-]{2,20}$/.test(lang) ? lang : "en";
    return fetchTranscript(requireYouTube(url), code);
  });

  ipcMain.handle("thumb:save", (_e, src: unknown, title: unknown) =>
    saveThumbnail(String(src ?? ""), typeof title === "string" ? title : "thumbnail"),
  );

  // -- shell -------------------------------------------------------------------
  ipcMain.on("shell:showItemInFolder", (_e, filePath: unknown) => {
    if (typeof filePath === "string" && filePath) shell.showItemInFolder(filePath);
  });
  ipcMain.on("shell:openPath", (_e, dir: unknown) => {
    if (typeof dir === "string" && dir) void shell.openPath(dir);
  });
  ipcMain.on("shell:openExternal", (_e, url: unknown) => void shell.openExternal(requireWebUrl(url)));

  // -- settings ----------------------------------------------------------------
  ipcMain.handle("settings:get", () => getSettings());
  ipcMain.handle("settings:set", (_e, patch: Partial<Settings>) => {
    const clean: Partial<Settings> = {};
    if (typeof patch?.downloadDir === "string" && patch.downloadDir) clean.downloadDir = patch.downloadDir;
    if (typeof patch?.cookiesFile === "string") clean.cookiesFile = patch.cookiesFile;
    if (typeof patch?.cookiesFromBrowser === "string") clean.cookiesFromBrowser = patch.cookiesFromBrowser;
    return setSettings(clean);
  });
  ipcMain.handle("settings:chooseDownloadDir", async (e) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(target(e)!, {
      title: "Choose a download folder",
      defaultPath: getSettings().downloadDir,
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled || !filePaths[0]) return null;
    setSettings({ downloadDir: filePaths[0] });
    return filePaths[0];
  });
  ipcMain.handle("settings:chooseCookiesFile", async (e) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(target(e)!, {
      title: "Choose a cookies.txt",
      filters: [{ name: "Cookies", extensions: ["txt"] }],
      properties: ["openFile"],
    });
    if (canceled || !filePaths[0]) return null;
    setSettings({ cookiesFile: filePaths[0] });
    return filePaths[0];
  });

  // -- yt-dlp maintenance ------------------------------------------------------
  ipcMain.handle("ytdlp:status", () => ytdlpStatus());
  ipcMain.handle("ytdlp:update", (e) =>
    updateYtdlp((p) => {
      const win = target(e);
      if (win && !win.isDestroyed()) win.webContents.send("ytdlp:updateProgress", p);
    }),
  );
}
