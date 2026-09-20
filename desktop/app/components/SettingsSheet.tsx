"use client";

import { useEffect, useState } from "react";
import type { CookiesFromBrowser, Platform, Settings, UpdateProgress, YtdlpStatus } from "@/shared/api";
import { dragon } from "@/app/lib/dragon";
import { FolderIcon, RefreshIcon, Spinner, XIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  platform: Platform | null;
};

const BROWSERS: { value: CookiesFromBrowser; label: string; mac?: boolean }[] = [
  { value: "", label: "None" },
  { value: "firefox", label: "Firefox" },
  { value: "chrome", label: "Chrome" },
  { value: "edge", label: "Edge" },
  { value: "brave", label: "Brave" },
  { value: "safari", label: "Safari", mac: true },
];

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export function SettingsSheet({ open, onClose, settings, onSettings, platform }: Props) {
  const [ytdlp, setYtdlp] = useState<YtdlpStatus | null>(null);
  const [updating, setUpdating] = useState<UpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void dragon().ytdlp.status().then(setYtdlp);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => dragon().ytdlp.onUpdateProgress(setUpdating), []);

  async function update() {
    setUpdateError(null);
    setUpdating({ percent: null, message: "Starting…" });
    try {
      setYtdlp(await dragon().ytdlp.update());
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setUpdating(null);
    }
  }

  async function chooseDir() {
    const dir = await dragon().settings.chooseDownloadDir();
    if (dir) onSettings({ ...settings, downloadDir: dir });
  }

  async function chooseCookies() {
    const file = await dragon().settings.chooseCookiesFile();
    if (file) onSettings({ ...settings, cookiesFile: file });
  }

  async function patch(p: Partial<Settings>) {
    onSettings(await dragon().settings.set(p));
  }

  if (!open) return null;

  return (
    // Covers the content area but leaves the title bar draggable.
    <div className="fixed inset-x-0 bottom-0 top-[38px] z-20 flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="Close settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="rise-in relative flex h-full w-full max-w-[26rem] flex-col border-l border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="settings-title" className="text-sm font-medium">
            Settings
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 rounded-lg p-2 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <XIcon />
          </button>
        </div>

        <div className="scroll-area flex-1 space-y-7 overflow-y-auto px-5 py-5">
          {/* Download folder */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Download folder</h3>
            <p
              className="truncate rounded-lg border border-line bg-background px-3 py-2 font-mono text-xs text-foreground/80"
              title={settings.downloadDir}
            >
              {settings.downloadDir}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={chooseDir} className="btn-secondary">
                Change…
              </button>
              <button
                type="button"
                onClick={() => dragon().shell.openPath(settings.downloadDir)}
                className="btn-secondary"
              >
                <FolderIcon /> Open
              </button>
            </div>
          </section>

          {/* Cookies */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Cookies</h3>
            <p className="text-xs leading-relaxed text-muted">
              Needed only for age-restricted, private, or members-only videos. A cookies.txt file takes
              precedence over a browser.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted">From browser</span>
              <select
                value={settings.cookiesFromBrowser}
                onChange={(e) => patch({ cookiesFromBrowser: e.target.value as CookiesFromBrowser })}
                className="field"
              >
                {BROWSERS.filter((b) => !b.mac || platform === "darwin").map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            {platform === "win32" &&
              ["chrome", "edge", "brave"].includes(settings.cookiesFromBrowser) && (
                <p className="text-xs leading-relaxed text-warning">
                  Chromium browsers on Windows usually fail with a DPAPI error because of app-bound cookie
                  encryption. Prefer Firefox or an exported cookies.txt.
                </p>
              )}
            <div className="space-y-1.5">
              <span className="text-xs text-muted">cookies.txt file</span>
              <div className="flex items-center gap-2">
                <p
                  className="min-w-0 flex-1 truncate rounded-lg border border-line bg-background px-3 py-2 font-mono text-xs text-foreground/80"
                  title={settings.cookiesFile}
                >
                  {settings.cookiesFile ? basename(settings.cookiesFile) : <span className="text-muted/60">none</span>}
                </p>
                <button type="button" onClick={chooseCookies} className="btn-secondary">
                  Choose…
                </button>
                {settings.cookiesFile && (
                  <button
                    type="button"
                    aria-label="Clear cookies file"
                    onClick={() => patch({ cookiesFile: "" })}
                    className="btn-secondary px-2"
                  >
                    <XIcon />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* yt-dlp */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted">yt-dlp</h3>
            <p className="text-xs leading-relaxed text-muted">
              YouTube changes its defences constantly. If downloads start failing with 403 or drop to
              360p, update first — it is almost always the fix.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-line bg-background px-3 py-2">
              <div className="min-w-0">
                <p className="font-mono text-xs tabular-nums">
                  {ytdlp === null ? "…" : ytdlp.version ?? <span className="text-accent">not installed</span>}
                </p>
                <p className="text-[11px] text-muted">
                  {ytdlp?.path ? (ytdlp.userManaged ? "Updated in-app" : "Bundled with the app") : "Download it below"}
                </p>
              </div>
              <button type="button" onClick={update} disabled={Boolean(updating)} className="btn-secondary">
                {updating ? <Spinner /> : <RefreshIcon />}
                {updating ? "Updating" : "Update"}
              </button>
            </div>
            {updating && (
              <div className="space-y-1.5">
                <div className="h-1 overflow-hidden rounded-full bg-background">
                  <div
                    className={`h-full rounded-full bg-accent transition-[width] duration-200 ease-out ${
                      updating.percent === null ? "bar-indeterminate w-full" : ""
                    }`}
                    style={updating.percent === null ? undefined : { width: `${updating.percent}%` }}
                  />
                </div>
                <p className="text-[11px] tabular-nums text-muted">{updating.message}</p>
              </div>
            )}
            {updateError && <p className="text-xs text-accent">{updateError}</p>}
          </section>
        </div>
      </aside>
    </div>
  );
}
