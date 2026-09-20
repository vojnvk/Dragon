"use client";

import { useEffect, useState } from "react";
import type { Transcript } from "@/shared/api";
import { dragon } from "@/app/lib/dragon";
import { CheckIcon, CopyIcon, FolderIcon, XIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  transcript: Transcript;
};

export function TranscriptDialog({ open, onClose, title, transcript }: Props) {
  const [timed, setTimed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const text = timed ? transcript.timed : transcript.text;
  const filename = transcript.filePath.split(/[\\/]/).pop();

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-[38px] z-20 flex items-center justify-center p-6" role="presentation">
      <button
        type="button"
        aria-label="Close transcript"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcript-title"
        className="rise-in relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="transcript-title" className="truncate text-sm font-medium">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => dragon().shell.showItemInFolder(transcript.filePath)}
              title="Show in folder"
              className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted transition-colors hover:text-foreground"
            >
              <FolderIcon width={12} height={12} /> {filename}
            </button>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 -mt-1 rounded-lg p-2 text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <XIcon />
          </button>
        </div>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className={`whitespace-pre-line text-sm leading-relaxed text-foreground/90 ${timed ? "font-mono text-[13px]" : ""}`}>
            {text}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={timed}
              onChange={(e) => setTimed(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Timestamps
          </label>
          <button type="button" onClick={copy} className="btn-primary h-9 min-w-[6.5rem] px-4">
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
