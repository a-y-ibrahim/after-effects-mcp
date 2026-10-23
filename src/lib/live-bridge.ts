import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { atomicWriteSync } from "./bridge-core.js";

type Peer = { socket: WebSocket; instanceId: string; active: boolean; version: string };
type Pending = {
  peer: Peer;
  resolve: (raw: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** One endpoint per MCP process; the CEP page serializes requests from all endpoints.
 * Once dispatched, a command is NEVER retried on a different transport. */
export class LiveBridge {
  private server?: WebSocketServer;
  private peers = new Map<WebSocket, Peer>();
  private pending = new Map<string, Pending>();
  private uncertain = new Set<string>();
  private token = randomUUID();
  readonly sessionId = randomUUID();
  private discoveryPath: string;
  constructor(
    private folder: string,
    private targetInstance = process.env.AE_MCP_INSTANCE_ID,
  ) {
    this.discoveryPath = path.join(folder, `endpoint-${process.pid}-${this.sessionId}.json`);
  }
  async start(): Promise<void> {
    fs.mkdirSync(this.folder, { recursive: true });
    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: 0,
      maxPayload: 32 * 1024 * 1024,
      perMessageDeflate: false,
    });
    this.server = server;
    server.on("connection", (socket, request) => {
      if (request.url !== `/${this.token}`) {
        socket.close(1008, "Invalid session");
        return;
      }
      const greetingTimeout = setTimeout(() => socket.close(1008, "Missing greeting"), 3000);
      socket.on("error", () => {});
      socket.on("message", (bytes) => {
        try {
          const message = JSON.parse(bytes.toString());
          if (message.type === "hello" && typeof message.instanceId === "string") {
            clearTimeout(greetingTimeout);
            this.peers.set(socket, {
              socket,
              instanceId: message.instanceId,
              active: !!message.active,
              version: message.version || "",
            });
          } else if (message.type === "state") {
            const peer = this.peers.get(socket);
            if (peer) peer.active = !!message.active;
          } else if (message.type === "result") {
            const pending = this.pending.get(message.commandId);
            if (
              !pending ||
              pending.peer.socket !== socket ||
              message.instanceId !== pending.peer.instanceId
            )
              return;
            const result = JSON.parse(message.result);
            if (result._commandId !== message.commandId) return;
            clearTimeout(pending.timer);
            this.pending.delete(message.commandId);
            this.uncertain.delete(message.commandId);
            pending.resolve(message.result);
          }
        } catch {
          socket.close(1008, "Invalid packet");
        }
      });
      socket.on("close", () => {
        clearTimeout(greetingTimeout);
        this.peers.delete(socket);
        for (const [id, pending] of this.pending) {
          if (pending.peer.socket !== socket) continue;
          clearTimeout(pending.timer);
          this.uncertain.add(id);
          pending.reject(
            new Error(
              `Connection lost after dispatch (${id}); outcome unknown. Do not retry the edit. Inspect AE, then reconnect the MCP server.`,
            ),
          );
          this.pending.delete(id);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No local WebSocket address");
    atomicWriteSync(
      this.discoveryPath,
      JSON.stringify({
        protocol: 1,
        pid: process.pid,
        sessionId: this.sessionId,
        port: address.port,
        token: this.token,
      }),
    );
  }
  select(): Peer | undefined {
    if (this.uncertain.size)
      throw new Error(
        "A previous command has an unknown outcome. Inspect AE and reconnect the MCP server before sending more commands.",
      );
    const peers = [...this.peers.values()].filter(
      (p) => !this.targetInstance || p.instanceId === this.targetInstance,
    );
    if (peers.length > 1)
      throw new Error(
        "Multiple AE panels connected. Set AE_MCP_INSTANCE_ID to the intended instance from bridge-metrics.",
      );
    if (!peers.length && this.targetInstance)
      throw new Error(
        "The selected AE instance is not connected; file fallback is disabled for explicit instance targeting.",
      );
    return peers[0];
  }
  async send(
    peer: Peer,
    commandId: string,
    command: string,
    args: object,
    timeoutMs: number,
  ): Promise<string> {
    if (!peer.active) throw new Error("The selected AE panel is paused; command not sent.");
    if (peer.socket.readyState !== WebSocket.OPEN)
      throw new Error("AE disconnected before dispatch; command not sent.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.uncertain.add(commandId);
        // Retain the waiter: a late matching result proves completion and unblocks the queue.
        reject(
          new Error(`Timed out after dispatch (${commandId}); outcome unknown. No retry was sent.`),
        );
      }, timeoutMs);
      this.pending.set(commandId, { peer, resolve, reject, timer });
      peer.socket.send(
        JSON.stringify({
          type: "command",
          instanceId: peer.instanceId,
          commandId,
          command,
          args,
          expiresAt: Date.now() + timeoutMs,
        }),
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.uncertain.add(commandId);
            reject(new Error(`Dispatch failed (${commandId}); outcome unknown: ${error.message}`));
          }
        },
      );
    });
  }
  status() {
    return {
      sessionId: this.sessionId,
      uncertainCommands: [...this.uncertain],
      instances: [...this.peers.values()].map(({ instanceId, active, version }) => ({
        instanceId,
        active,
        version,
      })),
    };
  }
  async close() {
    try {
      fs.unlinkSync(this.discoveryPath);
    } catch {
      /* already removed */
    }
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(
        new Error("MCP server shutting down; inspect any dispatched operation before retrying."),
      );
    }
    this.pending.clear();
    for (const socket of this.server?.clients || []) socket.terminate();
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }
}

export type Timing = {
  command: string;
  transport: string;
  queueMs: number;
  roundTripMs: number;
  executionMs?: number;
  renderMs?: number;
  responseBytes: number;
  at: string;
};
export class BridgeMetrics {
  samples: Timing[] = [];
  add(sample: Timing) {
    this.samples.push(sample);
    if (this.samples.length > 200) this.samples.shift();
  }
  report() {
    const groups: Record<string, { count: number; medianMs: number; p95Ms: number }> = {};
    for (const key of new Set(this.samples.map((s) => `${s.transport}:${s.command}`))) {
      const values = this.samples
        .filter((s) => `${s.transport}:${s.command}` === key)
        .map((s) => s.roundTripMs)
        .sort((a, b) => a - b);
      groups[key] = {
        count: values.length,
        medianMs: values[Math.floor(values.length / 2)],
        p95Ms: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)],
      };
    }
    return { groups, samples: this.samples };
  }
}
