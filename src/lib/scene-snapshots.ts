import { randomUUID } from "node:crypto";

export type SceneNode = { key: string; [key: string]: unknown };
type Snapshot = {
  id: string;
  capturedAt: string;
  scopeKey: string;
  nodes: SceneNode[];
  metadata: Record<string, unknown>;
  expires: number;
};
/** Immutable response pages; deltas always compare a freshly collected AE snapshot. */
export class SceneSnapshots {
  private snapshots = new Map<string, Snapshot>();
  private views = new Map<
    string,
    { snapshot: Snapshot; nodes: SceneNode[]; kind: string; baseId?: string }
  >();
  constructor(
    private pageBytes = 32 * 1024,
    private ttlMs = 15 * 60 * 1000,
  ) {}
  private prune() {
    for (const [id, s] of this.snapshots) if (s.expires < Date.now()) this.snapshots.delete(id);
    while (this.snapshots.size > 5) this.snapshots.delete(this.snapshots.keys().next().value!);
    for (const [id, view] of this.views)
      if (!this.snapshots.has(view.snapshot.id)) this.views.delete(id);
  }
  capture(nodes: SceneNode[], scopeKey: string, metadata: Record<string, unknown>, since?: string) {
    this.prune();
    const base = since ? this.snapshots.get(since) : undefined;
    if (since && (!base || base.scopeKey !== scopeKey))
      throw new Error("Snapshot expired or scope changed. Request a fresh full scene overview.");
    if (since && (metadata.truncated || base?.metadata.truncated))
      throw new Error(
        "Cannot compute a reliable delta from a truncated snapshot. Increase maxNodes and request a full snapshot.",
      );
    const snapshot: Snapshot = {
      id: randomUUID(),
      capturedAt: new Date().toISOString(),
      nodes,
      scopeKey,
      metadata,
      expires: Date.now() + this.ttlMs,
    };
    let output = nodes;
    if (base) {
      const old = new Map(base.nodes.map((n) => [n.key, JSON.stringify(n)]));
      const current = new Set(nodes.map((n) => n.key));
      output = nodes
        .filter((n) => old.get(n.key) !== JSON.stringify(n))
        .map((n) => ({ ...n, change: old.has(n.key) ? "updated" : "added" }));
      output.push(
        ...base.nodes
          .filter((n) => !current.has(n.key))
          .map((n) => ({ key: n.key, change: "removed" })),
      );
    }
    this.snapshots.set(snapshot.id, snapshot);
    const viewId = randomUUID();
    this.views.set(viewId, {
      snapshot,
      nodes: output,
      kind: base ? "delta" : "full",
      baseId: since,
    });
    this.prune();
    return this.page(`${viewId}:0`);
  }
  page(cursor: string) {
    this.prune();
    const [id, offsetText] = cursor.split(":");
    const view = this.views.get(id);
    const offset = Number(offsetText);
    if (
      !view ||
      !/^\d+$/.test(offsetText || "") ||
      !Number.isSafeInteger(offset) ||
      offset > view.nodes.length
    )
      throw new Error("Invalid or expired scene cursor. Request a fresh snapshot.");
    const nodes: SceneNode[] = [];
    let bytes = 0,
      index = offset;
    while (index < view.nodes.length) {
      const node = view.nodes[index];
      const size = Buffer.byteLength(JSON.stringify(node));
      if (nodes.length && bytes + size > this.pageBytes) break;
      if (size > this.pageBytes)
        nodes.push({
          key: node.key,
          truncated: true,
          reason: "Details exceed page budget; inspect this layer separately.",
          id: node.id,
          index: node.index,
          name: node.name,
        });
      else nodes.push(node);
      bytes += Math.min(size, this.pageBytes);
      index++;
    }
    return {
      status: "success",
      snapshotId: view.snapshot.id,
      capturedAt: view.snapshot.capturedAt,
      kind: view.kind,
      baseSnapshotId: view.baseId,
      ...view.snapshot.metadata,
      nodes,
      totalNodes: view.nodes.length,
      offset,
      incomplete:
        index < view.nodes.length ||
        !!view.snapshot.metadata.truncated ||
        nodes.some((n) => n.truncated),
      nextCursor: index < view.nodes.length ? `${id}:${index}` : null,
    };
  }
}
