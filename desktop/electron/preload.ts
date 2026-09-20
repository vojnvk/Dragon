import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { DragonApi, Platform } from "../shared/api";

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: DragonApi = {
  platform: process.platform as Platform,

  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:toggleMaximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    onMaximized: (cb) => subscribe("window:maximized", cb),
  },

  info: (url) => ipcRenderer.invoke("info", url),

  download: {
    start: (req) => ipcRenderer.invoke("download:start", req),
    cancel: () => ipcRenderer.invoke("download:cancel"),
    onProgress: (cb) => subscribe("download:progress", cb),
  },

  saveThumbnail: (src, title) => ipcRenderer.invoke("thumb:save", src, title),

  transcript: (url, lang) => ipcRenderer.invoke("transcript", url, lang),

  shell: {
    showItemInFolder: (filePath) => ipcRenderer.send("shell:showItemInFolder", filePath),
    openPath: (dir) => ipcRenderer.send("shell:openPath", dir),
    openExternal: (url) => ipcRenderer.send("shell:openExternal", url),
  },

  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch),
    chooseDownloadDir: () => ipcRenderer.invoke("settings:chooseDownloadDir"),
    chooseCookiesFile: () => ipcRenderer.invoke("settings:chooseCookiesFile"),
  },

  ytdlp: {
    status: () => ipcRenderer.invoke("ytdlp:status"),
    update: () => ipcRenderer.invoke("ytdlp:update"),
    onUpdateProgress: (cb) => subscribe("ytdlp:updateProgress", cb),
  },
};

contextBridge.exposeInMainWorld("dragon", api);
