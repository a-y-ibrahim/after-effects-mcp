import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SceneSnapshots } from "./lib/scene-snapshots.js";

type Send = (command: string, args?: Record<string, any>, timeoutMs?: number) => Promise<string>;
export function registerSceneTools(server: McpServer, send: Send, metrics: () => unknown) {
  const scenes = new SceneSnapshots();
  const details = new SceneSnapshots();
  const result = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });
  const failure = (error: unknown) => ({
    ...result({ status: "error", error: String(error) }),
    isError: true,
  });
  const selector = {
    compId: z.number().int().positive().optional(),
    compName: z.string().optional(),
    compIndex: z.number().int().positive().optional(),
  };
  server.tool(
    "inspect-scene",
    "Read a fresh scene dependency graph without rendering. Default: active comp and nested comps. Nodes include sources, parents, mattes, text, effects and animation hints. Follow nextCursor for immutable pages. sinceSnapshotId compares a fresh scan, including manual AE edits. Truncation is explicit.",
    {
      ...selector,
      scope: z.enum(["active", "project"]).optional(),
      maxNodes: z.number().int().min(1).max(50000).optional(),
      sinceSnapshotId: z.string().optional(),
      cursor: z.string().optional(),
    },
    async ({ cursor, sinceSnapshotId, ...args }) => {
      try {
        if (cursor) return result(scenes.page(cursor));
        const data = JSON.parse(await send("inspectScene", args, 30000));
        if (data.status === "error" || data.error) return { ...result(data), isError: true };
        const { nodes, _commandId: _id, _responseTimestamp: _time, ...metadata } = data;
        return result(
          scenes.capture(
            nodes,
            `${data.projectKey}:${data.scope}:${data.rootId}`,
            metadata,
            sinceSnapshotId,
          ),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.tool(
    "inspect-layers",
    "Read details of several layers in one AE call. Each item has its own success/error. Keyframes are omitted by default. Follow nextCursor for remaining results; use inspect-layer for oversized individual results.",
    {
      ...selector,
      layerIndices: z.array(z.number().int().positive()).min(1).max(50).optional(),
      includeKeyframes: z.boolean().optional(),
      maxKeyframes: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    },
    async ({ cursor, ...args }) => {
      try {
        if (cursor) return result(details.page(cursor));
        if (!args.layerIndices?.length)
          throw new Error("Provide layerIndices or a continuation cursor.");
        const data = JSON.parse(await send("inspectLayers", args, 30000));
        if (data.status === "error" || data.error) return { ...result(data), isError: true };
        return result(
          details.capture(
            data.results.map((n: any, i: number) => ({ ...n, key: String(i) })),
            "layers",
            { compId: data.compId, partialFailure: data.partialFailure, _timings: data._timings },
          ),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.tool(
    "bridge-metrics",
    "Report local bridge instances and bounded timing samples: queue wait, round trip, host execution, rendering and response bytes. Does not modify AE.",
    {},
    async () => result(metrics()),
  );
}
