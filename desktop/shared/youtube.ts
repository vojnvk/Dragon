/** Shared by main (validation) and renderer (paste detection). */
export function isYouTubeUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    return (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    );
  } catch {
    return false;
  }
}
