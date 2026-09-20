import { app } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Settings } from "../shared/api";

function settingsFile(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function defaults(): Settings {
  return {
    downloadDir: path.join(app.getPath("downloads"), "Dragon"),
    cookiesFromBrowser: "",
    cookiesFile: "",
  };
}

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>;
  } catch {
    // First run, or a corrupt file: defaults win.
  }
  cache = { ...defaults(), ...stored };
  return cache;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  mkdirSync(path.dirname(settingsFile()), { recursive: true });
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  cache = next;
  return next;
}
