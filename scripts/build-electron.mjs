#!/usr/bin/env node
/**
 * Bundle the Electron main and preload scripts with esbuild. `--watch` rebuilds
 * on change for `npm run dev`. Output is CommonJS: Electron loads the main
 * entry with require(), and a sandboxed preload cannot be an ES module.
 */
import { context, build } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["electron/main.ts", "electron/preload.ts"],
  outdir: "dist-electron",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
