import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { dropJob, getJob } from "@/lib/jobs";
import { contentTypeFor } from "@/lib/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing job id." }, { status: 400 });

  const job = getJob(id);
  if (!job || job.status !== "done" || !job.filePath || !job.filename) {
    return NextResponse.json({ error: "File is not ready." }, { status: 404 });
  }

  const nodeStream = createReadStream(job.filePath);
  // Once the browser has the bytes the temp copy is no longer needed.
  nodeStream.on("close", () => void dropJob(job.id));

  return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
    headers: {
      "Content-Type": contentTypeFor(job.filename),
      "Content-Length": String(job.size ?? 0),
      "Content-Disposition": contentDisposition(job.filename),
      "Cache-Control": "no-store",
    },
  });
}
