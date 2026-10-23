import { describe, expect, it } from "vitest";
import { SceneSnapshots } from "../src/lib/scene-snapshots.js";
describe("scene snapshots", () => {
  it("paginates an immutable snapshot and catches additions, removals and manual changes", () => {
    const store = new SceneSnapshots(80);
    const first = store.capture(
      [
        { key: "a", name: "same", value: 1 },
        { key: "b", name: "same", value: 2 },
        { key: "c", value: 3 },
      ],
      "project:comp",
      {},
    );
    expect(first.incomplete).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    const delta = store.capture(
      [
        { key: "a", name: "same", value: 4 },
        { key: "b", name: "same", value: 2 },
        { key: "d", value: 5 },
      ],
      "project:comp",
      {},
      first.snapshotId,
    );
    const all: any[] = [...delta.nodes];
    let cursor = delta.nextCursor;
    while (cursor) {
      const page = store.page(cursor);
      all.push(...page.nodes);
      cursor = page.nextCursor;
    }
    expect(all.map((n) => [n.key, n.change])).toEqual([
      ["a", "updated"],
      ["d", "added"],
      ["c", "removed"],
    ]);
    expect(store.page(first.nextCursor!).nodes).toContainEqual({ key: "c", value: 3 });
  });
  it("refuses deltas across scopes or incomplete graphs", () => {
    const store = new SceneSnapshots();
    const a = store.capture([], "one", { truncated: true });
    expect(() => store.capture([], "two", {}, a.snapshotId)).toThrow(/scope/);
    expect(() => store.capture([], "one", {}, a.snapshotId)).toThrow(/truncated/);
  });
  it("reports oversized details instead of emitting an unbounded reply", () => {
    const store = new SceneSnapshots(200);
    const result = store.capture([{ key: "a", value: "x".repeat(5000) }], "one", {});
    expect(result.nodes[0].truncated).toBe(true);
    expect(result.incomplete).toBe(true);
  });
  it("rejects malformed pagination cursors", () => {
    const store = new SceneSnapshots();
    expect(() => store.page("missing:0")).toThrow(/expired/);
  });
});
