# Dragon

Two independent apps live here, each with its own `package.json`:

- `desktop/` — Electron app (Windows/macOS). Next.js is a static export served by Electron; yt-dlp runs in the main process. Run commands from inside `desktop/`.
- `web/` — the original Next.js app with API routes (self-host / Vercel). Run commands from inside `web/`.

Each folder has an `AGENTS.md` with Next.js-specific notes — read the one for the app you are changing.
