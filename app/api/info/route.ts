import { NextResponse } from "next/server";
import { isYouTubeUrl, runYtdlp } from "@/lib/ytdlp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawFormat = {
  height?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
};

type RawThumb = { url?: string; width?: number; height?: number; preference?: number };

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
  qualities: { value: string; label: string }[];
};

function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Highest quality first. yt-dlp lists these without checking they exist, and
// YouTube only generates the larger sizes for high-resolution uploads, so each
// candidate has to be probed before it is offered to the user.
const THUMB_LADDER = ["maxresdefault", "sddefault", "hq720", "hqdefault", "mqdefault", "default"];

async function bestThumbnail(
  id: string,
  info: { thumbnails?: RawThumb[]; thumbnail?: string },
): Promise<string> {
  for (const name of THUMB_LADDER) {
    const candidate = `https://i.ytimg.com/vi/${id}/${name}.jpg`;
    const res = await fetch(candidate, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (res?.ok) return candidate;
  }
  const widest = (info.thumbnails ?? [])
    .filter((t): t is RawThumb & { url: string } => Boolean(t?.url))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return widest?.url ?? info.thumbnail ?? "";
}

export async function POST(request: Request) {
  let url: string;
  try {
    const body = (await request.json()) as { url?: string };
    url = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!url) return NextResponse.json({ error: "Paste a YouTube link first." }, { status: 400 });
  if (!isYouTubeUrl(url)) {
    return NextResponse.json({ error: "That doesn't look like a YouTube link." }, { status: 400 });
  }

  let json: string;
  try {
    json = await runYtdlp(["--dump-single-json", url]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read that video." },
      { status: 502 },
    );
  }

  const info = JSON.parse(json) as {
    id: string;
    title: string;
    channel?: string;
    uploader?: string;
    duration?: number;
    view_count?: number;
    upload_date?: string;
    webpage_url?: string;
    formats?: RawFormat[];
    thumbnails?: RawThumb[];
    thumbnail?: string;
  };

  const heights = [
    ...new Set(
      (info.formats ?? [])
        .filter((f) => f.vcodec && f.vcodec !== "none" && typeof f.height === "number")
        .map((f) => f.height as number),
    ),
  ].sort((a, b) => b - a);

  const qualities = [
    { value: "best", label: heights[0] ? `Best available (${heights[0]}p)` : "Best available" },
    ...heights.map((h) => ({ value: String(h), label: `${h}p` })),
    { value: "audio", label: "Audio only (m4a)" },
  ];

  const payload: VideoInfo = {
    id: info.id,
    title: info.title,
    channel: info.channel ?? info.uploader ?? "",
    duration: info.duration ?? null,
    durationLabel: formatDuration(info.duration ?? null),
    viewCount: info.view_count ?? null,
    uploadDate: info.upload_date
      ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}`
      : null,
    webpageUrl: info.webpage_url ?? url,
    thumbnail: await bestThumbnail(info.id, info),
    qualities,
  };

  return NextResponse.json(payload);
}
