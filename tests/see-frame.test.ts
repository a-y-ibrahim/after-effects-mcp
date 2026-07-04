import { describe, it, expect } from "vitest";
import {
  normalizeTimes,
  downscaleDims,
  scratchFramePath,
  buildFrameContent,
  sampleTimes,
  gridLayout,
} from "../src/lib/see-frame";

describe("normalizeTimes", () => {
  it("returns [] when times is undefined (caller uses a default)", () => {
    expect(normalizeTimes(undefined, 10)).toEqual([]);
  });

  it("wraps a single number into a one-element array", () => {
    expect(normalizeTimes(3, 10)).toEqual([3]);
  });

  it("clamps values into [0, duration]", () => {
    expect(normalizeTimes([-5, 4, 999], 10)).toEqual([0, 4, 10]);
  });

  it("drops non-finite values", () => {
    expect(normalizeTimes([NaN, Infinity, 2], 10)).toEqual([2]);
  });

  it("snaps to the frame grid when frameDuration is given", () => {
    // 30fps -> frameDuration 1/30; 0.5 snaps to the nearest frame boundary
    const out = normalizeTimes([0.5], 10, 1 / 30);
    expect(out[0]).toBeCloseTo(0.5, 5);
    const snapped = normalizeTimes([0.51], 10, 1 / 30);
    expect(snapped[0]).toBeCloseTo(Math.round(0.51 * 30) / 30, 5);
  });

  it("de-duplicates and sorts ascending", () => {
    expect(normalizeTimes([5, 1, 5, 1, 3], 10)).toEqual([1, 3, 5]);
  });
});

describe("downscaleDims", () => {
  it("returns native size when maxWidth is 0 (guaranteed-faithful path)", () => {
    expect(downscaleDims(1920, 1080, 0)).toEqual({ w: 1920, h: 1080, scaled: false });
  });

  it("returns native size when maxWidth >= source width", () => {
    expect(downscaleDims(1920, 1080, 4000)).toEqual({ w: 1920, h: 1080, scaled: false });
  });

  it("scales down aspect-preserved with even dimensions", () => {
    const d = downscaleDims(1920, 1080, 512);
    expect(d.scaled).toBe(true);
    expect(d.w % 2).toBe(0);
    expect(d.h % 2).toBe(0);
    // 512 wide at 16:9 -> ~288 tall
    expect(d.h).toBe(288);
  });

  it("guards against zero/invalid source dims", () => {
    expect(downscaleDims(0, 0, 512).scaled).toBe(false);
  });
});

describe("scratchFramePath", () => {
  it("produces unique paths per frame index", () => {
    const a = scratchFramePath("/tmp/bridge", "123-1", 0);
    const b = scratchFramePath("/tmp/bridge", "123-1", 1);
    expect(a).not.toBe(b);
    expect(a).toContain("__mcp_seeframe_");
    expect(a.endsWith(".png")).toBe(true);
  });

  it("sanitizes the command id and handles trailing separators", () => {
    const p = scratchFramePath("/tmp/bridge/", "a/b:c 1", 2);
    expect(p).toBe("/tmp/bridge/__mcp_seeframe_abc1_2.png");
  });
});

describe("sampleTimes", () => {
  it("returns N segment-midpoints inside (0, duration)", () => {
    const t = sampleTimes(10, 4);
    expect(t).toHaveLength(4);
    expect(t[0]).toBeGreaterThan(0);
    expect(t[t.length - 1]).toBeLessThan(10);
    // evenly spaced midpoints: 1.25, 3.75, 6.25, 8.75
    expect(t).toEqual([1.25, 3.75, 6.25, 8.75]);
  });

  it("clamps count into [1, 64]", () => {
    expect(sampleTimes(10, 0)).toHaveLength(1);
    expect(sampleTimes(10, 999)).toHaveLength(64);
  });

  it("handles a zero/invalid duration without NaN", () => {
    expect(sampleTimes(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("gridLayout", () => {
  it("picks a near-square grid that fits all cells", () => {
    expect(gridLayout(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridLayout(6)).toEqual({ cols: 3, rows: 2 });
    expect(gridLayout(9)).toEqual({ cols: 3, rows: 3 });
    expect(gridLayout(1)).toEqual({ cols: 1, rows: 1 });
  });

  it("always has enough cells for the count", () => {
    for (let n = 1; n <= 30; n++) {
      const g = gridLayout(n);
      expect(g.cols * g.rows).toBeGreaterThanOrEqual(n);
    }
  });
});

describe("buildFrameContent", () => {
  const read = (p: string) => (p.includes("bad") ? null : "BASE64DATA");

  it("emits a header, then a caption+image per readable frame", () => {
    const blocks = buildFrameContent(
      "Intro",
      [
        { time: 1, path: "/a.png", w: 512, h: 288 },
        { time: 2, path: "/b.png", w: 512, h: 288 },
      ],
      read,
    );
    const images = blocks.filter((b) => b.type === "image");
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ type: "image", mimeType: "image/png", data: "BASE64DATA" });
    expect(blocks[0]).toMatchObject({ type: "text" });
    expect((blocks[0] as { text: string }).text).toContain("2 frames");
  });

  it("degrades to a text note for an unreadable frame instead of throwing", () => {
    const blocks = buildFrameContent("Intro", [{ time: 1, path: "/bad.png" }], read);
    expect(blocks.some((b) => b.type === "image")).toBe(false);
    expect(blocks.some((b) => b.type === "text" && /could not be read/.test(b.text))).toBe(true);
  });

  it("appends the inspect-comp state as a trailing text block when provided", () => {
    const blocks = buildFrameContent("Intro", [{ time: 1, path: "/a.png" }], read, '{"layers":3}');
    const last = blocks[blocks.length - 1];
    expect(last).toMatchObject({ type: "text", text: '{"layers":3}' });
  });

  it("uses the singular 'frame' for a single capture", () => {
    const blocks = buildFrameContent("Intro", [{ time: 0, path: "/a.png" }], read);
    expect((blocks[0] as { text: string }).text).toContain("1 frame");
    expect((blocks[0] as { text: string }).text).not.toContain("frames");
  });
});
