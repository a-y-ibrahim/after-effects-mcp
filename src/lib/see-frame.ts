// Pure helpers for the see-frame tool (rendering comp frames back to the model as
// images). Everything here is deterministic and unit tested; the actual frame
// capture happens in After Effects via ExtendScript and the file bridge.

export interface FrameFile {
  time: number;
  path: string;
  w?: number;
  h?: number;
}

export type ImageContentBlock = { type: "image"; data: string; mimeType: string };
export type TextContentBlock = { type: "text"; text: string };
export type ContentBlock = ImageContentBlock | TextContentBlock;

/**
 * Normalize the requested capture times: accept a single number or an array,
 * drop non-finite values, clamp each into [0, duration], optionally snap to the
 * frame grid, de-duplicate, and sort ascending. Returns [] if nothing valid
 * (the caller then falls back to a default time such as the comp midpoint).
 */
export function normalizeTimes(
  times: number | number[] | undefined,
  duration: number,
  frameDuration?: number,
): number[] {
  if (times === undefined) return [];
  const arr = Array.isArray(times) ? times : [times];
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;

  const cleaned: number[] = [];
  for (const t of arr) {
    if (typeof t !== "number" || !Number.isFinite(t)) continue;
    let v = Math.min(Math.max(t, 0), dur);
    if (frameDuration && frameDuration > 0) {
      v = Math.round(v / frameDuration) * frameDuration;
      v = Math.min(Math.max(v, 0), dur);
    }
    // round to avoid float noise before de-dup
    cleaned.push(Math.round(v * 1e6) / 1e6);
  }

  return Array.from(new Set(cleaned)).sort((a, b) => a - b);
}

/**
 * Compute an aspect-preserved, even-rounded target size for the downscale comp.
 * maxWidth <= 0 (or >= source width) means "native resolution" -> returns the
 * source dims unchanged. Even rounding keeps codecs/AE happy.
 */
export function downscaleDims(
  srcW: number,
  srcH: number,
  maxWidth: number,
): { w: number; h: number; scaled: boolean } {
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW <= 0 || srcH <= 0) {
    return { w: srcW, h: srcH, scaled: false };
  }
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || maxWidth >= srcW) {
    return { w: srcW, h: srcH, scaled: false };
  }
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const w = even(maxWidth);
  const h = even((srcH * w) / srcW);
  return { w, h, scaled: true };
}

/**
 * Generate a unique scratch PNG path for a captured frame. Kept collision-free
 * across concurrent calls by including the command id and frame index.
 */
export function scratchFramePath(dir: string, commandId: string, index: number): string {
  const safeId = String(commandId).replace(/[^A-Za-z0-9_-]/g, "");
  const sep = dir.endsWith("/") || dir.endsWith("\\") ? "" : "/";
  return `${dir}${sep}__mcp_seeframe_${safeId}_${index}.png`;
}

/**
 * Sample N evenly-spaced times across [0, duration] for a contact sheet. Returns
 * the midpoints of N equal segments (so no frame sits exactly at t=0 or t=dur,
 * which often render empty at the very edges). count is clamped to [1, 64].
 */
export function sampleTimes(duration: number, count: number): number[] {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const n = Math.min(Math.max(1, Math.floor(count || 1)), 64);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (dur * (i + 0.5)) / n;
    out.push(Math.round(t * 1e6) / 1e6);
  }
  return out;
}

/**
 * Choose a near-square grid (cols x rows) that fits `count` cells, preferring a
 * slightly wider layout (landscape reads better). rows*cols is always >= count.
 */
export function gridLayout(count: number): { cols: number; rows: number } {
  const n = Math.max(1, Math.floor(count || 1));
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows };
}

/**
 * Build the MCP content[] array from captured frames. Each frame becomes a short
 * text caption followed by its image block; an optional trailing state block
 * carries the inspect-comp JSON so the model reasons over pixels + DOM together.
 * `readBase64` reads a frame path and returns its base64 (injected for testing).
 */
export function buildFrameContent(
  compName: string,
  frames: FrameFile[],
  readBase64: (path: string) => string | null,
  stateJson?: string,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const ok = frames.filter((f) => f && f.path);
  blocks.push({
    type: "text",
    text: `Rendered comp "${compName}" - ${ok.length} frame${ok.length === 1 ? "" : "s"}`,
  });

  for (const f of ok) {
    const b64 = readBase64(f.path);
    if (!b64) {
      blocks.push({ type: "text", text: `(frame at t=${f.time}s could not be read)` });
      continue;
    }
    const dims = f.w && f.h ? ` ${f.w}x${f.h}` : "";
    blocks.push({ type: "text", text: `${compName} @ t=${f.time}s${dims}` });
    blocks.push({ type: "image", data: b64, mimeType: "image/png" });
  }

  if (stateJson) blocks.push({ type: "text", text: stateJson });
  return blocks;
}
