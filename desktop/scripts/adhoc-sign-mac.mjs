// electron-builder afterPack hook.
//
// We ship without an Apple Developer certificate, so electron-builder skips
// signing (`identity: null`). That leaves the bundle carrying Electron's own
// linker-signed ad-hoc signature, which no longer matches after the app is
// renamed and its Info.plist and resources are rewritten — macOS then refuses
// to launch it with "Dragon is damaged and can't be opened".
//
// Ad-hoc signing the packed bundle ourselves makes the signature valid again.
// It is still unsigned as far as Gatekeeper is concerned, so a downloaded DMG
// keeps needing the quarantine step in the README, but the app is no longer
// reported as damaged.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// yt-dlp and ffmpeg live outside the asar and are not covered by --deep.
const EXTRA_BINARIES = ["bin/ffmpeg", "bin/yt-dlp"];

function sign(target, ...flags) {
  execFileSync("codesign", ["--force", ...flags, "--sign", "-", target], {
    stdio: "inherit",
  });
}

export default async function adhocSignMac(context) {
  if (context.electronPlatformName !== "darwin") return;

  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  for (const binary of EXTRA_BINARIES) {
    const target = path.join(app, "Contents/Resources", binary);
    if (existsSync(target)) sign(target);
  }

  sign(app, "--deep");
  execFileSync("codesign", ["--verify", "--deep", app], { stdio: "inherit" });
}
