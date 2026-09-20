"use client";

import { useEffect, useState } from "react";
import { dragon, usePlatform } from "@/app/lib/dragon";
import { CloseIcon, DragonMark, MaximizeIcon, MinimizeIcon, RestoreIcon } from "./icons";

/**
 * The frameless window's own chrome. The whole bar is a drag region; the
 * controls opt out. macOS keeps its native traffic lights (positioned by the
 * main process), so there the bar only reserves room for them on the left.
 */
export function TitleBar() {
  const platform = usePlatform();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!platform) return;
    const api = dragon();
    void api.window.isMaximized().then(setMaximized);
    return api.window.onMaximized(setMaximized);
  }, [platform]);

  const mac = platform === "darwin";

  return (
    <header
      className={`drag relative flex h-[38px] shrink-0 select-none items-center bg-background text-muted ${
        mac ? "pl-[78px]" : "pl-3"
      }`}
    >
      <div className="flex items-center gap-2 text-[12.5px] font-medium tracking-tight">
        <DragonMark className="text-accent" />
        <span className="text-foreground/80">Dragon</span>
      </div>

      {platform && !mac && (
        <div className="no-drag ml-auto flex h-full">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => dragon().window.minimize()}
            className="win-control"
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            aria-label={maximized ? "Restore" : "Maximize"}
            onClick={() => dragon().window.toggleMaximize()}
            className="win-control"
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dragon().window.close()}
            className="win-control win-control-close"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </header>
  );
}
