import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanError,
  explain,
  formatSelector,
  humanSpeed,
  isGated,
  isYouTubeUrl,
  parseProgressLine,
} from "./ytdlp-core.ts";

describe("isYouTubeUrl", () => {
  it("accepts the common hosts", () => {
    assert.equal(isYouTubeUrl("https://www.youtube.com/watch?v=abc"), true);
    assert.equal(isYouTubeUrl("https://youtu.be/abc"), true);
    assert.equal(isYouTubeUrl("https://m.youtube.com/watch?v=abc"), true);
    assert.equal(isYouTubeUrl("https://music.youtube.com/watch?v=abc"), true);
    assert.equal(isYouTubeUrl("  https://youtube.com/shorts/abc  "), true);
  });
  it("rejects everything else", () => {
    assert.equal(isYouTubeUrl("https://vimeo.com/123"), false);
    assert.equal(isYouTubeUrl("not a url"), false);
    assert.equal(isYouTubeUrl(""), false);
  });
});

describe("formatSelector", () => {
  it("audio", () => {
    assert.deepEqual(formatSelector("audio"), { format: "ba[ext=m4a]/ba/b", audioOnly: true });
  });
  it("best", () => {
    assert.deepEqual(formatSelector("best"), { format: "bv*+ba/b", audioOnly: false });
  });
  it("explicit height", () => {
    assert.deepEqual(formatSelector("1080"), {
      format: "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
      audioOnly: false,
    });
  });
  it("garbage falls back to best", () => {
    assert.deepEqual(formatSelector("wat"), { format: "bv*+ba/b", audioOnly: false });
  });
});

describe("humanSpeed", () => {
  it("scales units", () => {
    assert.equal(humanSpeed(null), null);
    assert.equal(humanSpeed(0), null);
    assert.equal(humanSpeed(512), "512 B/s");
    assert.equal(humanSpeed(1048576), "1.0 MB/s");
    assert.equal(humanSpeed(15 * 1048576), "15 MB/s");
  });
});

describe("parseProgressLine", () => {
  it("parses a progress line", () => {
    assert.deepEqual(parseProgressLine("PROG|50|100|NA|1048576|12"), {
      kind: "progress",
      percent: 50,
      speed: "1.0 MB/s",
      eta: 12,
    });
  });
  it("falls back to the estimate when total is unknown", () => {
    assert.deepEqual(parseProgressLine("PROG|25|NA|200|NA|NA"), {
      kind: "progress",
      percent: 12.5,
      speed: null,
      eta: null,
    });
  });
  it("leaves percent null when nothing is known", () => {
    assert.deepEqual(parseProgressLine("PROG|NA|NA|NA|NA|NA"), {
      kind: "progress",
      percent: null,
      speed: null,
      eta: null,
    });
  });
  it("detects the merge phase", () => {
    assert.deepEqual(parseProgressLine('[Merger] Merging formats into "x.mp4"'), { kind: "merging" });
    assert.deepEqual(parseProgressLine("[ExtractAudio] Destination: x.m4a"), { kind: "merging" });
  });
  it("ignores noise", () => {
    assert.equal(parseProgressLine("[youtube] abc: Downloading webpage"), null);
  });
});

describe("cleanError", () => {
  it("surfaces the first ERROR line without the prefix", () => {
    const stderr = "WARNING: something\nERROR: [youtube] abc: Video unavailable\nmore";
    assert.equal(cleanError(stderr), "[youtube] abc: Video unavailable");
  });
  it("falls back to the last line", () => {
    assert.equal(cleanError("a\nb\n\n"), "b");
    assert.equal(cleanError(""), "");
  });
});

describe("isGated / explain", () => {
  it("recognises gate errors", () => {
    assert.equal(isGated("HTTP Error 403: Forbidden"), true);
    assert.equal(isGated("Sign in to confirm you're not a bot"), true);
    assert.equal(isGated("Video unavailable"), false);
  });
  it("explains common failures", () => {
    assert.match(explain("This video is DRM protected"), /DRM/);
    assert.match(explain("HTTP Error 403: Forbidden"), /Update yt-dlp/);
    assert.match(explain("Sign in to confirm you're not a bot"), /cookies/i);
    assert.equal(explain("plain"), "plain");
  });
});
