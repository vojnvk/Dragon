import { BrowserWindow, Menu, app, protocol, shell } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { registerIpc } from "./ipc";
import { cancelDownload } from "./ytdlp";

const isMac = process.platform === "darwin";
const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);
const APP_ID = "dev.dragon.app";

// ---------------------------------------------------------------------------
// app:// serves the static Next.js export. A real scheme (rather than file://)
// keeps the absolute /_next/... asset paths working and gives the page a proper
// origin, so fetch and storage behave normally.

// Thumbnails are the only remote content the page ever loads.
const CSP = [
  "default-src 'self'",
  // The Next.js export boots from inline scripts and Tailwind injects styles.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.ytimg.com https://*.ytimg.com https://*.ggpht.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function registerAppProtocol(): void {
  // Inside app.asar when packaged; Electron's fs reads from it transparently.
  const root = path.join(app.getAppPath(), "out");

  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    else if (!path.extname(pathname)) pathname += ".html";

    const file = path.normalize(path.join(root, pathname));
    if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });

    try {
      const body = await readFile(file);
      const ext = path.extname(file);
      return new Response(body, {
        headers: {
          "Content-Type": MIME[ext] ?? "application/octet-stream",
          ...(ext === ".html" ? { "Content-Security-Policy": CSP } : {}),
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

// ---------------------------------------------------------------------------

let win: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 740,
    minWidth: 720,
    minHeight: 540,
    show: false,
    backgroundColor: "#0b0b0f",
    title: "Dragon",
    // Packaged builds take the icon from the executable / bundle.
    ...(app.isPackaged ? {} : { icon: path.join(app.getAppPath(), "assets", "icon.png") }),
    // macOS keeps its native traffic lights, moved into our title bar; other
    // platforms draw everything themselves.
    ...(isMac
      ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 16, y: 13 } }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  window.once("ready-to-show", () => window.show());

  // The renderer never opens windows or navigates away; links go to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = isDev ? process.env.ELECTRON_RENDERER_URL! : "app://-/";
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  const sendMaximized = () => window.webContents.send("window:maximized", window.isMaximized());
  window.on("maximize", sendMaximized);
  window.on("unmaximize", sendMaximized);

  if (isDev) void window.loadURL(process.env.ELECTRON_RENDERER_URL!);
  else void window.loadURL("app://-/index.html");

  window.on("closed", () => {
    win = null;
  });
  return window;
}

function buildMenu(): void {
  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS needs an Edit menu for Cmd+C / Cmd+V to reach the page at all.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
}

// A second launch focuses the running window instead of starting another copy.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId(APP_ID);
    registerAppProtocol();
    buildMenu();
    registerIpc(() => win);
    win = createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) win = createWindow();
    });
  });

  // Never leave a yt-dlp behind writing into the download folder.
  app.on("before-quit", () => cancelDownload());

  app.on("window-all-closed", () => {
    if (!isMac) app.quit();
  });
}
