# Dragon web

The browser version. If you just want to download videos, use the desktop app
in `../desktop` instead. This one exists for self-hosting.

## Run locally

```
npm install
npm run dev
```

Open http://localhost:3000. yt-dlp and ffmpeg come from npm (`youtube-dl-exec`,
`ffmpeg-static`) plus a nightly yt-dlp fetched into `./bin` on install.

If downloads start failing with 403, run `npm run update-ytdlp`. That's the
fix nine times out of ten.

## How it works

`POST /api/download` returns a Server-Sent Events stream: progress ticks while
yt-dlp runs, then a `done` event with a URL for the file. Everything happens
inside one request, which is what lets it run on serverless at all.

| Route | Does |
| --- | --- |
| `POST /api/info` | `yt-dlp --dump-single-json`: title, channel, thumbnail, available heights |
| `POST /api/download` | SSE progress, then `done` with a file URL |
| `GET /api/file?id=` | serves the file from disk (local only) |
| `GET /api/thumb?src=` | proxies the thumbnail so it downloads instead of opening |

Locally the file is served from disk. On Vercel the function's disk dies with
the request, so the file is pushed to Vercel Blob and the browser is sent there.

If the normal path is blocked, it retries once with yt-dlp's `android` client.
That usually works but is capped around 360p; the UI says when it happened.

## Deploying to Vercel

```
vercel link --project dragon
vercel blob create-store dragon --access public --yes
vercel deploy --prod
```

Know what you're getting into:

- YouTube blocks datacenter IPs. Expect "Sign in to confirm you're not a bot"
  from an AWS IP. Cookies or a residential proxy are the only ways around it
  (below).
- 300 s per download on Hobby. Download, merge and upload to Blob all have to
  fit. Long or 4K videos won't.
- About 512 MB of temp disk, and video + audio + merged output all sit there
  at once.
- Blob costs money, files are public to anyone with the URL, and nothing
  deletes them.
- The deployment is public. Anyone with the link can run up your bill.

Hosting a public YouTube downloader also violates YouTube's terms, and hosts
do take them down.

### Getting past the bot check

Cookies (free): export a Netscape `cookies.txt` from a browser extension,
base64 it, set `YTDLP_COOKIES`:

```
base64 -w0 cookies.txt        # macOS/Git Bash: base64 -i cookies.txt
vercel env add YTDLP_COOKIES production
vercel deploy --prod
```

Those cookies are a live login. Use a throwaway Google account; Google
terminates accounts whose cookies show up from datacenter IPs. Export from a
private window and close it without logging out, or the session dies. They
expire, so you'll redo this.

Residential proxy (paid): `vercel env add YTDLP_PROXY production` with
`http://user:pass@host:port`. No account at risk.

Or don't host it: run locally behind a Cloudflare Tunnel. Free, and you keep
your residential IP.

## Local cookies

For age-restricted or private videos:

```
YTDLP_COOKIES_FILE=/path/to/cookies.txt
YTDLP_COOKIES_FROM_BROWSER=firefox
```

Chromium browsers fail on Windows with a DPAPI error. Use Firefox or the
exported file. DRM'd videos can't be downloaded either way.

## Quality

"Best available" merges the top video and audio streams into mp4. At the top
of the ladder that's AV1/Opus, which not every player handles. Pick 1080p if
you want something that plays everywhere.
