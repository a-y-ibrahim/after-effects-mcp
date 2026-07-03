import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { collectPresetFiles } from "../src/lib/preset-scan";

// Fixture tree:
//   root1/a.ffx
//   root1/b.txt
//   root1/sub/c.ffx
//   root1/sub/deep/d.ffx
//   root2/e.ffx
let tmp: string;
let root1: string;
let root2: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ae-preset-"));
  root1 = path.join(tmp, "root1");
  root2 = path.join(tmp, "root2");
  fs.mkdirSync(path.join(root1, "sub", "deep"), { recursive: true });
  fs.mkdirSync(root2, { recursive: true });
  fs.writeFileSync(path.join(root1, "a.ffx"), "x");
  fs.writeFileSync(path.join(root1, "b.txt"), "x");
  fs.writeFileSync(path.join(root1, "sub", "c.ffx"), "x");
  fs.writeFileSync(path.join(root1, "sub", "deep", "d.ffx"), "x");
  fs.writeFileSync(path.join(root2, "e.ffx"), "x");
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const names = (rs: { name: string }[]) => rs.map((r) => r.name).sort();

describe("collectPresetFiles", () => {
  it("non-recursive returns only top-level .ffx across roots", () => {
    const out = collectPresetFiles([root1, root2], false);
    expect(names(out)).toEqual(["a.ffx", "e.ffx"]);
  });

  it("recursive descends into subdirectories", () => {
    const out = collectPresetFiles([root1, root2], true);
    expect(names(out)).toEqual(["a.ffx", "c.ffx", "d.ffx", "e.ffx"]);
  });

  it("skips non-.ffx files", () => {
    const out = collectPresetFiles([root1], true);
    expect(out.some((r) => r.name === "b.txt")).toBe(false);
  });

  it("matches a case-insensitive extension", () => {
    const upper = path.join(root2, "F.FFX");
    fs.writeFileSync(upper, "x");
    try {
      const out = collectPresetFiles([root2], false);
      expect(out.some((r) => r.name === "F.FFX")).toBe(true);
    } finally {
      fs.rmSync(upper, { force: true });
    }
  });

  it("query matches on the path, not only the basename", () => {
    // 'sub' appears in the directory path of c.ffx, not its file name.
    const out = collectPresetFiles([root1], true, "sub");
    expect(out.some((r) => r.name === "c.ffx")).toBe(true);
    expect(out.some((r) => r.name === "a.ffx")).toBe(false);
  });

  it("caps the total number of results across roots", () => {
    const out = collectPresetFiles([root1, root2], true, undefined, 1);
    expect(out).toHaveLength(1);
  });

  it("respects maxDepth: depth 1 reaches sub/ but not sub/deep/", () => {
    const out = collectPresetFiles([root1], true, undefined, 500, 1);
    const found = names(out);
    expect(found).toContain("c.ffx"); // depth 1
    expect(found).not.toContain("d.ffx"); // depth 2
  });

  it("skips an unreadable root and still scans the others", () => {
    const ghost = path.join(tmp, "does-not-exist");
    const out = collectPresetFiles([ghost, root2], false);
    expect(names(out)).toEqual(["e.ffx"]);
  });

  it("returns the full metadata shape for each hit", () => {
    const out = collectPresetFiles([root2], false);
    const hit = out.find((r) => r.name === "e.ffx")!;
    expect(hit.path).toContain("e.ffx");
    expect(hit.directory).toBe(root2);
    expect(typeof hit.size).toBe("number");
    expect(() => new Date(hit.modifiedAt).toISOString()).not.toThrow();
  });
});
