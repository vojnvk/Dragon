#!/usr/bin/env node
/**
 * Fetch a self-contained yt-dlp into ./bin, tracking the nightly channel. This
 * is what gets bundled into the app by electron-builder and what `npm run dev`
 * uses. Runs on postinstall and via `npm run update-ytdlp`. Never fails the
 * install — a network hiccup here should not block `npm install`.
 */
import path from "node:path";
import { binaryName, downloadYtdlp } from "./ytdlp-release.mjs";

const target = path.join(process.cwd(), "bin", binaryName());

downloadYtdlp(target, ({ message }) => console.log(`[update-ytdlp] ${message}`))
  .then(() => console.log(`[update-ytdlp] wrote ${target}`))
  .catch((e) => {
    console.log(`[update-ytdlp] skipped: ${e.message}`);
    process.exit(0);
  });
