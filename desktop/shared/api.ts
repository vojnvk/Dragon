/**
 * The contract between the Electron main process and the renderer. Both sides
 * import from here; the preload script implements `DragonApi` and exposes it as
 * `window.dragon`.
 */

export type Quality = { value: string; label: string };

/** A subtitle track; `auto` marks YouTube's machine-generated captions. */
export type Caption = { lang: string; label: string; auto: boolean };

export type VideoInfo = {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  durationLabel: string;
  viewCount: number | null;
  uploadDate: string | null;
  webpageUrl: string;
  thumbnail: string;
  qualities: Quality[];
  captions: Caption[];
};

export type Transcript = {
  filePath: string;
  /** Plain text, one caption per line. This is what the file contains. */
  text: string;
  /** Same lines prefixed with "[m:ss] ". */
  timed: string;
};

export type DownloadStatus = "downloading" | "merging" | "done" | "error" | "cancelled";

export type Progress = {
  id: string;
  status: DownloadStatus;
  /** 0-100 for the file currently being downloaded. */
  percent: number;
  /** Human readable, e.g. "4.2 MB/s". */
  speed: string | null;
  /** Seconds. */
  eta: number | null;
};

export type DownloadRequest = {
  url: string;
  quality: string;
  /** Used only for the notification text. */
  title: string;
};

export type DownloadResult = {
  id: string;
  status: "done" | "error" | "cancelled";
  /** Absolute path of the finished file. */
  filePath: string | null;
  filename: string | null;
  size: number | null;
  /** True when only the restricted (lower quality) fallback got through. */
  restricted: boolean;
  error: string | null;
};

export type CookiesFromBrowser = "" | "firefox" | "chrome" | "edge" | "brave" | "safari";

export type Settings = {
  downloadDir: string;
  cookiesFromBrowser: CookiesFromBrowser;
  cookiesFile: string;
};

export type Platform = "win32" | "darwin" | "linux";

export type YtdlpStatus = {
  /** Where the binary in use lives, or null when none was found. */
  path: string | null;
  version: string | null;
  /** True when the binary came from an in-app update rather than the bundle. */
  userManaged: boolean;
};

export type UpdateProgress = { percent: number | null; message: string };

export type DragonApi = {
  platform: Platform;

  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximized(cb: (maximized: boolean) => void): () => void;
  };

  info(url: string): Promise<VideoInfo>;

  download: {
    start(req: DownloadRequest): Promise<DownloadResult>;
    cancel(): Promise<void>;
    onProgress(cb: (p: Progress) => void): () => void;
  };

  /** Save the thumbnail into the download folder; resolves with the file path. */
  saveThumbnail(src: string, title: string): Promise<string>;

  /** Save the transcript as plain text into the download folder. */
  transcript(url: string, lang: string): Promise<Transcript>;

  shell: {
    showItemInFolder(filePath: string): void;
    openPath(dir: string): void;
    openExternal(url: string): void;
  };

  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    chooseDownloadDir(): Promise<string | null>;
    chooseCookiesFile(): Promise<string | null>;
  };

  ytdlp: {
    status(): Promise<YtdlpStatus>;
    update(): Promise<YtdlpStatus>;
    onUpdateProgress(cb: (p: UpdateProgress) => void): () => void;
  };
};
