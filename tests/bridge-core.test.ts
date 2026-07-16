import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  bridgeToolResult,
  atomicWriteSync,
  uniqueExistingDirs,
  candidatePresetRoots,
  makeCommandIdFactory,
  resolveBridgeDir,
  aerenderCandidates,
  buildFfmpegConvertArgs,
  tail,
  nextPollDelay,
  POLL_START_MS,
} from "../src/lib/bridge-core";

describe("bridgeToolResult", () => {
  it("flags a bridge result with status:error as isError", () => {
    const r = bridgeToolResult(JSON.stringify({ status: "error", error: "boom" }));
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("boom");
  });

  it("flags success:false as isError", () => {
    const r = bridgeToolResult(JSON.stringify({ success: false }));
    expect(r.isError).toBe(true);
  });

  it("flags any error field as isError, even with a truthy status", () => {
    const r = bridgeToolResult(JSON.stringify({ status: "ok", error: "nope" }));
    expect(r.isError).toBe(true);
  });

  it("does NOT flag a clean success payload", () => {
    const r = bridgeToolResult(JSON.stringify({ status: "success", result: 42 }));
    expect(r.isError).toBeUndefined();
  });

  it("passes non-JSON text through untouched and never flags it", () => {
    const r = bridgeToolResult("just a plain string, not JSON");
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toBe("just a plain string, not JSON");
  });

  it("does not treat error:undefined (absent) as an error", () => {
    const r = bridgeToolResult(JSON.stringify({ status: "success" }));
    expect(r.isError).toBeUndefined();
  });

  it("always returns a single text content block", () => {
    const r = bridgeToolResult("anything");
    expect(r.content).toHaveLength(1);
    expect(r.content[0].type).toBe("text");
  });
});

describe("atomicWriteSync", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-mcp-test-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the exact data to the target file", () => {
    const target = path.join(dir, "cmd.json");
    atomicWriteSync(target, '{"hello":"world"}');
    expect(fs.readFileSync(target, "utf8")).toBe('{"hello":"world"}');
  });

  it("overwrites an existing target", () => {
    const target = path.join(dir, "cmd.json");
    atomicWriteSync(target, "first");
    atomicWriteSync(target, "second");
    expect(fs.readFileSync(target, "utf8")).toBe("second");
  });

  it("leaves no .tmp sibling behind on success", () => {
    const target = path.join(dir, "cmd.json");
    atomicWriteSync(target, "data");
    expect(fs.existsSync(target + ".tmp")).toBe(false);
  });
});

describe("uniqueExistingDirs", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-mcp-dirs-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps existing directories and drops non-existent ones", () => {
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    const ghost = path.join(dir, "ghost");
    const out = uniqueExistingDirs([real, ghost]);
    expect(out).toContain(path.normalize(real));
    expect(out).not.toContain(path.normalize(ghost));
  });

  it("drops files, keeping only directories", () => {
    const file = path.join(dir, "a-file.txt");
    fs.writeFileSync(file, "x");
    expect(uniqueExistingDirs([file])).toEqual([]);
  });

  it("de-duplicates repeated paths", () => {
    const real = path.join(dir, "real");
    fs.mkdirSync(real);
    const out = uniqueExistingDirs([real, real, path.normalize(real)]);
    expect(out).toHaveLength(1);
  });

  it("ignores empty / falsy entries", () => {
    expect(uniqueExistingDirs(["", dir])).toEqual([path.normalize(dir)]);
  });
});

describe("candidatePresetRoots", () => {
  // NOTE: candidatePresetRoots uses path.join, which emits the HOST separator.
  // In production the injected platform always equals the host, so we assert on
  // separator-agnostic path segments ("Applications", "Presets") rather than a
  // literal "/Applications", which would break when the test host is Windows.
  it("includes Windows Program Files preset roots on win32", () => {
    const roots = candidatePresetRoots("C:\\Users\\x", "win32", {
      APPDATA: "C:\\Users\\x\\AppData\\Roaming",
      ProgramFiles: "C:\\Program Files",
    });
    expect(roots.some((r) => r.includes("Program Files") && r.includes("Presets"))).toBe(true);
    expect(roots.some((r) => r.includes("AppData") && r.includes("Roaming"))).toBe(true);
    // no macOS Applications paths on Windows
    expect(roots.some((r) => r.includes("Applications"))).toBe(false);
  });

  it("includes macOS Applications preset roots on darwin", () => {
    const roots = candidatePresetRoots("/Users/x", "darwin", {});
    expect(roots.some((r) => r.includes("Applications") && r.includes("Presets"))).toBe(true);
    // no Windows Program Files paths on macOS
    expect(roots.some((r) => r.includes("Program Files"))).toBe(false);
  });

  it("always includes the shared Documents/Adobe roots on both platforms", () => {
    for (const [home, plat] of [
      ["C:\\Users\\x", "win32"],
      ["/Users/x", "darwin"],
    ] as const) {
      const roots = candidatePresetRoots(home, plat, {});
      expect(roots.some((r) => r.includes("Documents") && r.includes("Adobe"))).toBe(true);
    }
  });

  it("covers the three most recent AE year folders", () => {
    const roots = candidatePresetRoots("/Users/x", "darwin", {});
    for (const year of ["2024", "2025", "2026"]) {
      expect(roots.some((r) => r.includes(year))).toBe(true);
    }
  });
});

describe("resolveBridgeDir", () => {
  it("lets a non-empty AE_MCP_BRIDGE_DIR override win on any platform", () => {
    const dir = resolveBridgeDir("win32", { AE_MCP_BRIDGE_DIR: "X:\\shared" }, "C:\\Users\\x");
    expect(dir).toBe("X:\\shared");
    const dir2 = resolveBridgeDir("darwin", { AE_MCP_BRIDGE_DIR: "/shared" }, "/Users/x");
    expect(dir2).toBe("/shared");
  });

  it("ignores an empty-string override and falls through to the platform default", () => {
    const dir = resolveBridgeDir("darwin", { AE_MCP_BRIDGE_DIR: "" }, "/Users/x");
    expect(dir).toContain("Documents");
  });

  it("uses LOCALAPPDATA on win32 when set (OneDrive-proof)", () => {
    const dir = resolveBridgeDir(
      "win32",
      { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" },
      "C:\\Users\\x",
    );
    expect(dir).toContain("AppData");
    expect(dir).toContain("ae-mcp-bridge");
  });

  it("falls back to AppData/Local on win32 when LOCALAPPDATA is unset", () => {
    const dir = resolveBridgeDir("win32", {}, "C:\\Users\\x");
    expect(dir).toContain("AppData");
    expect(dir).toContain("Local");
  });

  it("uses Documents on non-Windows platforms", () => {
    const dir = resolveBridgeDir("darwin", {}, "/Users/x");
    expect(dir).toContain("Documents");
    expect(dir).toContain("ae-mcp-bridge");
  });
});

describe("aerenderCandidates", () => {
  it("builds Windows aerender.exe paths newest-year-first", () => {
    const c = aerenderCandidates("win32", { ProgramFiles: "C:\\Program Files" });
    expect(c[0]).toContain("2026");
    expect(c[0]).toContain("aerender.exe");
    expect(c.every((p) => p.includes("Program Files"))).toBe(true);
  });

  it("defaults ProgramFiles when unset on win32", () => {
    const c = aerenderCandidates("win32", {});
    expect(c[0]).toContain("Program Files");
  });

  it("builds macOS aerender paths (no .exe, no Support Files) on darwin", () => {
    const c = aerenderCandidates("darwin", {});
    expect(c[0]).toContain("Applications");
    expect(c.some((p) => p.endsWith("aerender"))).toBe(true);
    expect(c.some((p) => p.includes("aerender.exe"))).toBe(false);
  });
});

describe("buildFfmpegConvertArgs", () => {
  it("transcodes to 16-bit PCM WAV without forcing a sample rate or channel count", () => {
    const args = buildFfmpegConvertArgs("/in/song.mp3", "/out/song.wav");
    expect(args).toEqual([
      "-y",
      "-protocol_whitelist",
      "file",
      "-i",
      "/in/song.mp3",
      "-vn",
      "-acodec",
      "pcm_s16le",
      "/out/song.wav",
    ]);
    expect(args).not.toContain("-ar");
    expect(args).not.toContain("-ac");
  });

  it("restricts ffmpeg to the file protocol, ahead of -i", () => {
    const args = buildFfmpegConvertArgs("/in/song.mp3", "/out/song.wav");
    const whitelistIdx = args.indexOf("-protocol_whitelist");
    const inputIdx = args.indexOf("-i");
    expect(whitelistIdx).toBeGreaterThanOrEqual(0);
    expect(whitelistIdx).toBeLessThan(inputIdx);
    expect(args[whitelistIdx + 1]).toBe("file");
  });

  it("passes the input and output paths through unchanged, even if URL-like", () => {
    const args = buildFfmpegConvertArgs("http://evil.example/track.mp3", "C:\\temp\\out.wav");
    expect(args).toContain("http://evil.example/track.mp3");
    expect(args).toContain("C:\\temp\\out.wav");
  });
});

describe("nextPollDelay", () => {
  it("grows the delay by the factor each step", () => {
    expect(nextPollDelay(40, 250)).toBe(60); // 40 * 1.5
    expect(nextPollDelay(60, 250)).toBe(90);
  });

  it("never exceeds the cap", () => {
    expect(nextPollDelay(200, 250)).toBe(250); // 300 capped to 250
    expect(nextPollDelay(250, 250)).toBe(250);
  });

  it("always advances by at least 1ms", () => {
    expect(nextPollDelay(0, 250)).toBeGreaterThanOrEqual(1);
  });

  it("backs off from the fast start to the cap in a bounded number of steps", () => {
    let d = POLL_START_MS;
    const cap = 250;
    let steps = 0;
    while (d < cap && steps < 100) {
      d = nextPollDelay(d, cap);
      steps++;
    }
    expect(d).toBe(cap);
    expect(steps).toBeLessThan(10); // reaches the cap quickly
  });
});

describe("tail", () => {
  it("returns the string unchanged when within the limit", () => {
    expect(tail("hello", 4000)).toBe("hello");
  });

  it("returns exactly the last maxChars when over the limit", () => {
    const s = "abcdefghij";
    expect(tail(s, 3)).toBe("hij");
    expect(tail(s, 3)).toHaveLength(3);
  });

  it("returns the whole string at the exact boundary", () => {
    expect(tail("abc", 3)).toBe("abc");
  });
});

describe("makeCommandIdFactory", () => {
  it("produces strictly unique ids across many calls", () => {
    const next = makeCommandIdFactory(() => 1000);
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(next());
    expect(ids.size).toBe(500);
  });

  it("increments the sequence even when the clock does not move", () => {
    const next = makeCommandIdFactory(() => 42);
    expect(next()).toBe("42-1");
    expect(next()).toBe("42-2");
    expect(next()).toBe("42-3");
  });

  it("embeds the current timestamp in the id", () => {
    const next = makeCommandIdFactory(() => 1234567890);
    expect(next()).toMatch(/^1234567890-\d+$/);
  });

  it("keeps independent factories on independent sequences", () => {
    const a = makeCommandIdFactory(() => 1);
    const b = makeCommandIdFactory(() => 1);
    a();
    a();
    expect(b()).toBe("1-1");
  });
});
