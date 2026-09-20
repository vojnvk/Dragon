import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/* Window controls follow the Windows 11 glyphs: 10px, 1px strokes. */
export const MinimizeIcon = (p: Props) => (
  <svg {...base} width={10} height={10} viewBox="0 0 10 10" strokeWidth={1} {...p}>
    <path d="M0 5h10" />
  </svg>
);

export const MaximizeIcon = (p: Props) => (
  <svg {...base} width={10} height={10} viewBox="0 0 10 10" strokeWidth={1} {...p}>
    <rect x="0.5" y="0.5" width="9" height="9" rx="1.2" />
  </svg>
);

export const RestoreIcon = (p: Props) => (
  <svg {...base} width={10} height={10} viewBox="0 0 10 10" strokeWidth={1} {...p}>
    <rect x="0.5" y="2.5" width="7" height="7" rx="1.2" />
    <path d="M2.5 2.5V1.7A1.2 1.2 0 0 1 3.7 .5h4.6a1.2 1.2 0 0 1 1.2 1.2v4.6a1.2 1.2 0 0 1-1.2 1.2H7.5" />
  </svg>
);

export const CloseIcon = (p: Props) => (
  <svg {...base} width={10} height={10} viewBox="0 0 10 10" strokeWidth={1} {...p}>
    <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
  </svg>
);

export const DragonMark = (p: Props) => (
  <svg {...base} viewBox="0 0 16 16" fill="currentColor" stroke="none" {...p}>
    <path d="M8 1.2 13.6 4.4v6.4L8 14 2.4 10.8V4.4L8 1.2Zm0 2.3L4.4 5.6v4.5L8 12.2l3.6-2.1V5.6L8 3.5Zm0 2.1 1.9 1.1v2.2L8 10 6.1 8.9V6.7L8 5.6Z" />
  </svg>
);

export const SettingsIcon = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="2.25" />
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
  </svg>
);

export const FolderIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6v6A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12v-7.5Z" />
  </svg>
);

export const DownloadIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 12.5v1A.5.5 0 0 0 3 14h10a.5.5 0 0 0 .5-.5v-1" />
  </svg>
);

export const ImageIcon = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <circle cx="5.5" cy="6.5" r="1.2" />
    <path d="M14.5 10.5 11 7l-5 5.5" />
  </svg>
);

export const TextIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
  </svg>
);

export const ExpandIcon = (p: Props) => (
  <svg {...base} width={12} height={12} {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </svg>
);

export const CopyIcon = (p: Props) => (
  <svg {...base} {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </svg>
);

export const CheckIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);

export const XIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const ExternalIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M6.5 3.5H3.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
  </svg>
);

export const RefreshIcon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3.6h-3.6" />
  </svg>
);

export const Spinner = (p: Props) => (
  <svg {...base} className={`animate-spin ${p.className ?? ""}`} {...p}>
    <path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5" />
  </svg>
);
