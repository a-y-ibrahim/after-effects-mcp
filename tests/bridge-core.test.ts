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
