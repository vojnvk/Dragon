# Dragon — web version

> Looking for the desktop app? See [`../desktop`](../desktop) — this folder is
> the original self-hosted / Vercel variant.

Paste a YouTube link. Get the video in the highest available quality, the
thumbnail, and a one-click copy of the title.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Nothing to install globally — both `yt-dlp` and
`ffmpeg` are vendored as npm dependencies (`youtube-dl-exec` and
`ffmpeg-static`), which is also what makes the deployed build work.

## Keeping downloads working

**This is the one thing that matters for reliability.**

YouTube changes its streaming defences constantly. `youtube-dl-exec` vendors
whichever yt-dlp *stable* release was current when it was published, which drifts
weeks behind — and a stale binary shows up as `HTTP Error 403: Forbidden` on
perfectly ordinary videos, or silently drops you to 360p.

So this project tracks the yt-dlp **nightly** channel. `npm install` does it
automatically via `postinstall`; to refresh at any time:

```bash
npm run update-ytdlp
```

If a download 403s, run that first. It is almost always the fix.

## How it works

One request does the whole job. `POST /api/download` returns a **Server-Sent
Events** stream: progress ticks while yt-dlp runs, then a final `done` event with
a URL to the finished file. Everything happens inside a single invocation, so no
state has to be shared between requests — which is what lets it run on
serverless at all.

| Route | Does |
| --- | --- |
| `POST /api/info` | `yt-dlp --dump-single-json` → title, channel, thumbnail, available heights |
| `POST /api/download` | SSE: progress → `done` with a file URL |
| `GET /api/file?id=` | serves the file from disk (local only) |
| `GET /api/thumb?src=` | proxies the thumbnail so it downloads instead of opening |

Locally the file is served straight off disk. Deployed, the function's disk dies
with the invocation, so the finished file is pushed to **Vercel Blob** and the
browser is sent there.

If the normal path is blocked, the app retries once on yt-dlp's `android` player
client. That usually gets through but is capped at ~360p, so it is a last resort
and the UI tells you when it happened. Seeing that means yt-dlp is due an update.

## Deploying to Vercel

```bash
vercel link --project dragon                    # a capitalised folder name is rejected
vercel blob create-store dragon --access public --yes   # sets BLOB_READ_WRITE_TOKEN
vercel deploy --prod
```

Read the limits below before relying on it.

### What works, and what doesn't

Vercel is not a natural host for this workload. It runs, with real edges:

- **YouTube blocks datacenter IPs.** This is the big one. Vercel runs on AWS, and
  yt-dlp from cloud IP ranges frequently gets `Sign in to confirm you're not a
  bot`. Your home connection's residential IP is why the local version works so
  reliably. If the deployment starts failing this way, cookies are the only fix —
  see below.
- **300 seconds per download** (Hobby plan maximum). Download + merge + upload to
  Blob all have to finish inside that. Long or 4K videos will time out; pick a
  lower quality for those.
- **~512 MB of temp disk.** The separate video and audio streams plus the merged
  output all live there at once, so very large videos can exhaust it.
- **Blob storage costs money** and files are public to anyone with the URL.
  Nothing prunes them — delete old blobs periodically.
- **The deployment is public.** Anyone with the link can use it and run up your
  usage. Put Vercel's Deployment Protection in front of it if that matters.

Running a public YouTube downloader also breaks YouTube's Terms of Service, and
hosts do take these down. Personal local use and operating a service for other
people are meaningfully different exposure.

## Getting the hosted version past YouTube

A deployment on Vercel runs from an AWS datacenter IP, and YouTube answers those
with `Sign in to confirm you're not a bot`. Nothing in the code fixes this. There
are two ways through, both configured with environment variables.

### Option A — cookies (free)

Export a `cookies.txt` in Netscape format with a browser extension, then base64
it so it survives an environment variable, and set `YTDLP_COOKIES`:

```bash
base64 -w0 cookies.txt          # macOS/Git Bash: base64 -i cookies.txt
vercel env add YTDLP_COOKIES production   # paste the base64 string
vercel deploy --prod
```

Raw (non-base64) contents work too. The app stages the file in the temp
directory at runtime, because yt-dlp rewrites it as cookies refresh and the rest
of a serverless filesystem is read-only.

**Read this before you do it.** Those cookies are a live login to whatever
account exported them:

- Anyone who compromises the deployment gets that Google account.
- Google flags accounts whose cookies are used from datacenter IPs, and
  terminations do happen. **Use a throwaway account, never your main one.**
- Export from a private window and close it *without logging out* — logging out
  invalidates the session server-side and the cookies stop working.
- They expire. Expect to redo this periodically.

### Option B — a residential proxy (costs money)

Routes requests through a residential IP, which is what YouTube is actually
checking. No account credentials involved, so no account to lose:

```bash
vercel env add YTDLP_PROXY production     # http://user:pass@host:port
```

### Option C — don't host it

Run it locally and expose it with a Cloudflare Tunnel. Free, no cookies, no
proxy bill, and it keeps your residential IP — which is why the local version
works reliably in the first place. Your machine has to be on.

## Local cookies

For age-restricted, private, or members-only videos on a local run:

```bash
YTDLP_COOKIES_FILE=/path/to/cookies.txt
YTDLP_COOKIES_FROM_BROWSER=firefox
```

Chromium browsers (chrome/edge/brave) usually fail on Windows with a `DPAPI`
decryption error because of Chrome's app-bound cookie encryption, so prefer
Firefox or the exported `cookies.txt`.

Some videos are DRM protected and cannot be downloaded by any of the above.

## Quality

"Best available" takes the top video stream plus the top audio stream and merges
them into MP4. At the top of the ladder YouTube serves AV1/Opus — the highest
quality, but not playable everywhere. Pick an explicit height like `1080p` if you
want something more broadly compatible.
