"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Quality = { value: string; label: string };

type VideoInfo = {
  id: string;
  title: string;
  channel: string;
  durationLabel: string;
  viewCount: number | null;
  uploadDate: string | null;
  webpageUrl: string;
  thumbnail: string;
  qualities: Quality[];
};

type JobState = {
  status: "downloading" | "merging" | "uploading" | "done" | "error";
  percent: number;
  speed: string | null;
  eta: number | null;
  filename: string | null;
  size: number | null;
  restricted: boolean;
  /** Set once the file is ready, so the UI can offer a manual link too. */
  url: string | null;
  error: string | null;
};

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

/**
 * Hand the file to the browser's downloader. An anchor click is used rather than
 * a router navigation, which would try to render the response as a page. The
 * `download` attribute only applies same-origin; a hosted Blob URL relies on the
 * content-disposition header it is served with instead.
 */
function save(url: string, filename?: string | null): void {
  try {
    const link = document.createElement("a");
    link.href = url;
    if (url.startsWith("/")) link.download = filename ?? "";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    // Some browsers block a click this long after the original gesture. The UI
    // keeps a visible link for exactly this case.
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [quality, setQuality] = useState("best");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => cancelRun, [cancelRun]);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    cancelRun();
    setLoading(true);
    setError(null);
    setInfo(null);
    setJob(null);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setInfo(data as VideoInfo);
      setQuality("best");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function startDownload() {
    if (!info) return;
    cancelRun();
    setError(null);
    setJob({
      status: "downloading",
      percent: 0,
      speed: null,
      eta: null,
      filename: null,
      size: null,
      restricted: false,
      url: null,
      error: null,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: info.webpageUrl, quality }),
        signal: controller.signal,
      });
    } catch {
      setJob(null);
      setError("Could not reach the server.");
      return;
    }

    // A validation failure comes back as plain JSON rather than an event stream.
    if (!res.ok || !res.body) {
      const message = await res.json().catch(() => null);
      setJob(null);
      setError(message?.error ?? "Could not start the download.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // The stream must end on a done or error event. If it just stops — server
    // restart, dropped connection, a hosted function hitting its time limit —
    // saying so beats leaving the button spinning on "Working…" forever.
    let settled = false;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === "progress") {
            setJob((prev) => (prev ? { ...prev, ...event } : prev));
          } else if (event.type === "error") {
            settled = true;
            setJob((prev) => (prev ? { ...prev, status: "error", error: event.error } : prev));
          } else if (event.type === "done") {
            settled = true;
            setJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: "done",
                    percent: 100,
                    filename: event.filename,
                    size: event.size,
                    restricted: event.restricted,
                    url: event.url,
                  }
                : prev,
            );
            save(event.url, event.filename);
          }
        }
      }

      if (!settled) {
        setJob((prev) =>
          prev
            ? { ...prev, status: "error", error: "The connection dropped before the file was ready." }
            : prev,
        );
      }
    } catch (e) {
      // An abort is the user's own doing and needs no message.
      const aborted = e instanceof DOMException && e.name === "AbortError";
      if (!aborted && !settled) {
        setJob((prev) =>
          prev ? { ...prev, status: "error", error: "Lost the connection to the server." } : prev,
        );
      }
    } finally {
      abortRef.current = null;
    }
  }

  async function copyTitle() {
    if (!info) return;
    await navigator.clipboard.writeText(info.title);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const busy = job?.status === "downloading" || job?.status === "merging" || job?.status === "uploading";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-14 sm:py-20">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dragon</h1>
        <p className="text-sm text-muted">
          Paste a YouTube link. Get the video in the best quality, the thumbnail, and the title.
        </p>
      </header>

      <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          required
          autoFocus
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition placeholder:text-muted/60 focus:border-accent/70 focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading…" : "Fetch"}
        </button>
      </form>

      {error && (
        <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
          {error}
        </p>
      )}

      {info && (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.thumbnail} alt="" className="aspect-video w-full bg-black object-cover" />

          <div className="space-y-5 p-5">
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <h2 className="flex-1 text-lg leading-snug font-medium">{info.title}</h2>
                <button
                  onClick={copyTitle}
                  className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-foreground/40 hover:text-foreground"
                >
                  {copied ? "Copied" : "Copy title"}
                </button>
              </div>
              <p className="text-xs text-muted">
                {[
                  info.channel,
                  info.durationLabel,
                  info.viewCount ? `${info.viewCount.toLocaleString()} views` : null,
                  info.uploadDate,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                disabled={busy}
                className="rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent/70 disabled:opacity-50"
              >
                {info.qualities.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>

              <button
                onClick={startDownload}
                disabled={busy}
                className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Working…" : "Download video"}
              </button>

              <a
                href={`/api/thumb?src=${encodeURIComponent(info.thumbnail)}&name=${encodeURIComponent(info.title)}`}
                className="rounded-xl border border-line px-4 py-2.5 text-center text-sm text-muted transition hover:border-foreground/40 hover:text-foreground"
              >
                Thumbnail
              </a>
            </div>

            {job && job.status !== "error" && (
              <div className="space-y-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${job.percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted">
                  {job.status === "uploading"
                    ? "Uploading…"
                    : job.status === "merging"
                    ? "Merging video and audio…"
                    : job.status === "done"
                      ? `Saved ${job.filename ?? ""} · ${humanSize(job.size)}`
                      : `${job.percent}%${job.speed ? ` · ${job.speed}` : ""}${
                          job.eta ? ` · ${job.eta}s left` : ""
                        }`}
                </p>

                {job.status === "done" && job.url && (
                  <a
                    href={job.url}
                    {...(job.url.startsWith("/") ? { download: job.filename ?? "" } : {})}
                    className="inline-block text-xs text-accent underline underline-offset-2"
                  >
                    Didn&apos;t start? Save it here
                  </a>
                )}
              </div>
            )}

            {job?.status === "done" && job.restricted && (
              <p className="text-xs text-amber-400">
                Only a lower-quality stream was reachable. Run{" "}
                <code className="font-mono">npm run update-ytdlp</code> to refresh yt-dlp — a stale
                copy is almost always the cause.
              </p>
            )}

            {job?.status === "error" && (
              <p className="text-xs text-accent">{job.error ?? "Download failed."}</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
