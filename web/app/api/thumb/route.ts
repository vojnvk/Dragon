import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["i.ytimg.com", "img.youtube.com", "i9.ytimg.com", "yt3.ggpht.com"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const src = params.get("src");
  const name = params.get("name") ?? "thumbnail";
  if (!src) return NextResponse.json({ error: "Missing src." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return NextResponse.json({ error: "Invalid src." }, { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "Only YouTube thumbnails are allowed." }, { status: 400 });
  }

  const upstream = await fetch(target, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not fetch that thumbnail." }, { status: 502 });
  }

  const ext = target.pathname.endsWith(".webp") ? "webp" : "jpg";
  const safe = name.replace(/[^\w \-.]/g, "_").slice(0, 120) || "thumbnail";

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Content-Disposition": `attachment; filename="${safe}.${ext}"`,
      "Cache-Control": "no-store",
    },
  });
}
