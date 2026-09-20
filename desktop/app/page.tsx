"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DownloadResult, Progress, Settings, Transcript, VideoInfo } from "@/shared/api";
import { isYouTubeUrl } from "@/shared/youtube";
import { dragon, useInElectron, usePlatform } from "./lib/dragon";
import { SettingsSheet } from "./components/SettingsSheet";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalIcon,
  FolderIcon,
  ImageIcon,
  SettingsIcon,
  TextIcon,
  Spinner,
  XIcon,
} from "./components/icons";

type Job = { progress: Progress | null; result: DownloadResult | null };

function humanSize(bytes: number | null): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function humanEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "";
  if (seconds < 60) return `${Math.round(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")} left`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [quality, setQuality] = useState("best");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [thumb, setThumb] = useState<"idle" | "saving" | "saved">("idle");
  const [captionLang, setCaptionLang] = useState("");
  const [transcript, setTranscript] = useState<{
    busy: boolean;
    result: Transcript | null;
    expanded: boolean;
    copied: "plain" | "timed" | null;
  }>({ busy: false, result: null, expanded: false, copied: null });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const platform = usePlatform();
  const inElectron = useInElectron();
  const inputRef = useRef<HTMLInputElement>(null);
  // IPC calls cannot be aborted; a stale reply is simply ignored.
  const lookupSeq = useRef(0);

  const lookup = useCallback(async (raw: string) => {
    const target = raw.trim();
    if (!target) return;
    const seq = ++lookupSeq.current;
    setFetching(true);
    setError(null);
    setInfo(null);
    setJob(null);
    setThumb("idle");
    setTranscript({ busy: false, result: null, expanded: false, copied: null });
    try {
      const data = await dragon().info(target);
      if (seq !== lookupSeq.current) return;
      setInfo(data);
      setQuality("best");
      setCaptionLang(data.captions[0]?.lang ?? "");
    } catch (e) {
      if (seq !== lookupSeq.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (seq === lookupSeq.current) setFetching(false);
    }
  }, []);

  // Boot: settings, platform, progress feed, global shortcuts.
  useEffect(() => {
    if (!inElectron) return;
    const api = dragon();
    void api.settings.get().then(setSettings);

    const offProgress = api.download.onProgress((p) =>
      setJob((prev) => (prev ? { ...prev, progress: p } : prev)),
    );

    // Paste a link anywhere in the window and it is looked up straight away.
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (!isYouTubeUrl(text)) return;
      e.preventDefault();
      setUrl(text.trim());
      void lookup(text);
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = api.platform === "darwin" ? e.metaKey : e.ctrlKey;
      if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((o) => !o);
      }
    };
    document.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    return () => {
      offProgress();
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
    };
  }, [inElectron, lookup]);

  async function startDownload() {
    if (!info) return;
    setError(null);
    setJob({
      progress: { id: "", status: "downloading", percent: 0, speed: null, eta: null },
      result: null,
    });
    try {
      const result = await dragon().download.start({ url: info.webpageUrl, quality, title: info.title });
      setJob((prev) => (prev ? { ...prev, result } : prev));
    } catch (e) {
      setJob(null);
      setError(e instanceof Error ? e.message : "Download failed.");
    }
  }

  async function saveThumbnail() {
    if (!info) return;
    setThumb("saving");
    try {
      await dragon().saveThumbnail(info.thumbnail, info.title);
      setThumb("saved");
      setTimeout(() => setThumb("idle"), 1800);
    } catch (e) {
      setThumb("idle");
      setError(e instanceof Error ? e.message : "Could not save the thumbnail.");
    }
  }

  async function saveTranscript() {
    if (!info || !captionLang) return;
    setError(null);
    setTranscript({ busy: true, result: null, expanded: false, copied: null });
    try {
      const result = await dragon().transcript(info.webpageUrl, captionLang);
      setTranscript({ busy: false, result, expanded: false, copied: null });
    } catch (e) {
      setTranscript({ busy: false, result: null, expanded: false, copied: null });
      setError(e instanceof Error ? e.message : "Could not fetch the transcript.");
    }
  }

  async function copyTranscript(timed: boolean) {
    if (!transcript.result) return;
    await navigator.clipboard.writeText(timed ? transcript.result.timed : transcript.result.text);
    setTranscript((t) => ({ ...t, copied: timed ? "timed" : "plain" }));
    setTimeout(() => setTranscript((t) => ({ ...t, copied: null })), 1600);
  }

  async function copyTitle() {
    if (!info) return;
    await navigator.clipboard.writeText(info.title);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const progress = job?.progress ?? null;
  const result = job?.result ?? null;
  const busy = Boolean(job && !result);
  const merging = progress?.status === "merging";

  if (inElectron === false) {
    return (
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <h1 className="text-lg font-medium">Dragon runs as a desktop app</h1>
        <p className="text-sm text-muted">
          This page is being viewed in a browser. Start it with <code className="font-mono">npm run dev</code>{" "}
          and use the Electron window instead.
        </p>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 pb-12 pt-10 sm:pt-14">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.25rem]">Dragon</h1>
          <p className="text-sm text-muted">
            Paste a YouTube link — anywhere in the window. Best quality video, thumbnail, and title.
          </p>
        </div>
        <button
          type="button"
          aria-label="Settings"
          title={`Settings (${platform === "darwin" ? "⌘" : "Ctrl+"},)`}
          onClick={() => setSettingsOpen(true)}
          className="mt-1 shrink-0 rounded-xl border border-line p-2.5 text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <SettingsIcon />
        </button>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(url);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          ref={inputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          required
          autoFocus
          spellCheck={false}
          className="field flex-1"
        />
        <button type="submit" disabled={fetching || !url.trim()} className="btn-primary min-w-[6.5rem]">
          {fetching ? <Spinner /> : null}
          {fetching ? "Loading" : "Fetch"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rise-in rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          {error}
        </p>
      )}

      {info && (
        <section className="rise-in overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="relative aspect-video w-full bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={info.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
            {info.durationLabel && (
              <span className="absolute bottom-3 right-3 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white backdrop-blur">
                {info.durationLabel}
              </span>
            )}
          </div>

          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <h2 className="flex-1 text-lg font-medium leading-snug">{info.title}</h2>
                <button
                  type="button"
                  onClick={copyTitle}
                  className="btn-secondary h-8 shrink-0 px-2.5 text-xs"
                  aria-live="polite"
                >
                  {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
                  <span className="w-[4.5rem] text-left">{copied ? "Copied" : "Copy title"}</span>
                </button>
              </div>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {[
                  info.channel,
                  info.viewCount ? `${info.viewCount.toLocaleString()} views` : null,
                  info.uploadDate,
                ]
                  .filter(Boolean)
                  .map((part, i) => (
                    <span key={i} className="flex items-center gap-2">
                      {i > 0 && <span aria-hidden>·</span>}
                      {part}
                    </span>
                  ))}
                <button
                  type="button"
                  onClick={() => dragon().shell.openExternal(info.webpageUrl)}
                  className="inline-flex items-center gap-1 text-muted transition-colors hover:text-foreground"
                >
                  <span aria-hidden>·</span> Open on YouTube <ExternalIcon width={12} height={12} />
                </button>
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                disabled={busy}
                aria-label="Quality"
                className="field h-11 sm:w-auto sm:min-w-[11rem]"
              >
                {info.qualities.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>

              {busy ? (
                <button type="button" onClick={() => dragon().download.cancel()} className="btn-secondary h-11 flex-1">
                  <XIcon /> Cancel
                </button>
              ) : (
                <button type="button" onClick={startDownload} className="btn-primary flex-1">
                  <DownloadIcon /> {result?.status === "done" ? "Download again" : "Download video"}
                </button>
              )}

              <button
                type="button"
                onClick={saveThumbnail}
                disabled={thumb === "saving"}
                className="btn-secondary h-11"
              >
                {thumb === "saved" ? <CheckIcon className="text-success" /> : <ImageIcon />}
                {thumb === "saved" ? "Saved" : "Thumbnail"}
              </button>
            </div>

            {/* Transcript: subtitles or auto-captions flattened to a .txt */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {info.captions.length > 0 ? (
                <>
                  <select
                    value={captionLang}
                    onChange={(e) => setCaptionLang(e.target.value)}
                    disabled={transcript.busy}
                    aria-label="Transcript language"
                    className="field h-9 text-xs sm:w-auto sm:min-w-[11rem]"
                  >
                    {info.captions.map((c) => (
                      <option key={c.lang} value={c.lang}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveTranscript}
                    disabled={transcript.busy}
                    className="btn-secondary h-9"
                  >
                    {transcript.busy ? <Spinner /> : <TextIcon />}
                    {transcript.busy ? "Fetching" : "Transcript"}
                  </button>
                </>
              ) : (
                <p className="text-xs text-muted">No subtitles or captions for this video.</p>
              )}
            </div>

            {transcript.result && (
              <div className="rise-in space-y-2 rounded-xl border border-line bg-background p-4">
                <p
                  className={`whitespace-pre-line text-sm leading-relaxed text-foreground/90 ${
                    transcript.expanded ? "scroll-area max-h-80 overflow-y-auto" : "line-clamp-3"
                  }`}
                >
                  {transcript.result.text}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => setTranscript((t) => ({ ...t, expanded: !t.expanded }))}
                    className="underline decoration-line underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {transcript.expanded ? "Show less" : "Show all"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyTranscript(false)}
                    className="underline decoration-line underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {transcript.copied === "plain" ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyTranscript(true)}
                    className="underline decoration-line underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {transcript.copied === "timed" ? "Copied" : "Copy with timestamps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => dragon().shell.showItemInFolder(transcript.result!.filePath)}
                    className="underline decoration-line underline-offset-4 transition-colors hover:text-foreground"
                  >
                    Show in folder
                  </button>
                </div>
              </div>
            )}

            {job && (
              <div className="rise-in space-y-2.5">
                <div className="h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className={`h-full rounded-full bg-accent transition-[width] duration-300 ease-out ${
                      merging ? "bar-indeterminate" : ""
                    } ${result?.status === "error" ? "bg-accent/40" : ""}`}
                    style={{ width: `${result?.status === "done" ? 100 : progress?.percent ?? 0}%` }}
                  />
                </div>

                <div className="flex min-h-[2.25rem] items-center justify-between gap-3 text-xs text-muted">
                  {!result && (
                    <p className="tabular-nums">
                      {merging
                        ? "Merging video and audio…"
                        : [
                            `${Math.round(progress?.percent ?? 0)}%`,
                            progress?.speed,
                            humanEta(progress?.eta ?? null),
                          ]
                            .filter(Boolean)
                            .join("  ·  ")}
                    </p>
                  )}

                  {result?.status === "done" && (
                    <>
                      <p className="min-w-0 truncate text-foreground/90" title={result.filename ?? ""}>
                        <CheckIcon className="mr-1.5 inline-block text-success" />
                        Saved {result.filename} <span className="text-muted">· {humanSize(result.size)}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => result.filePath && dragon().shell.showItemInFolder(result.filePath)}
                        className="btn-secondary h-8 shrink-0 px-2.5 text-xs"
                      >
                        <FolderIcon /> Show in folder
                      </button>
                    </>
                  )}

                  {result?.status === "cancelled" && <p>Cancelled.</p>}
                  {result?.status === "error" && (
                    <p role="alert" className="text-accent">
                      {result.error ?? "Download failed."}
                    </p>
                  )}
                </div>

                {result?.status === "done" && result.restricted && (
                  <p className="text-xs leading-relaxed text-warning">
                    Only a lower-quality stream was reachable. Update yt-dlp in Settings — a stale copy is
                    almost always the cause.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {settings && (
        <footer className="mt-auto flex items-center gap-2 text-xs text-muted">
          <FolderIcon className="shrink-0" />
          <span className="shrink-0">Saving to</span>
          <button
            type="button"
            onClick={() => dragon().shell.openPath(settings.downloadDir)}
            title="Open folder"
            className="min-w-0 truncate font-mono text-foreground/70 transition-colors hover:text-foreground"
          >
            {settings.downloadDir}
          </button>
          <button
            type="button"
            onClick={async () => {
              const dir = await dragon().settings.chooseDownloadDir();
              if (dir) setSettings({ ...settings, downloadDir: dir });
            }}
            className="shrink-0 underline decoration-line underline-offset-4 transition-colors hover:text-foreground"
          >
            Change
          </button>
        </footer>
      )}

      {settings && (
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          onSettings={setSettings}
          platform={platform}
        />
      )}
    </main>
  );
}
