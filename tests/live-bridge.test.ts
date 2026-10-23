import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LiveBridge } from "../src/lib/live-bridge.js";
import { acquireFileLease } from "../src/lib/file-lease.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
async function fixture() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ae-live-test-"));
  cleanup.push(async () => fs.rmSync(folder, { recursive: true, force: true }));
  const bridge = new LiveBridge(folder);
  await bridge.start();
  cleanup.push(() => bridge.close());
  const config = JSON.parse(fs.readFileSync(path.join(folder, fs.readdirSync(folder)[0]), "utf8"));
  async function connect(id = "ae-test", active = true, token = config.token) {
    const socket = new WebSocket(`ws://127.0.0.1:${config.port}/${token}`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(JSON.stringify({ type: "hello", instanceId: id, active, version: "test" }));
    await tick();
    return socket;
  }
  return { bridge, folder, connect };
}
describe("live bridge delivery semantics", () => {
  it("authenticates, addresses an instance and correlates results", async () => {
    const { bridge, connect } = await fixture();
    const socket = await connect();
    socket.on("message", (raw) => {
      const packet = JSON.parse(raw.toString());
      expect(packet.instanceId).toBe("ae-test");
      socket.send(
        JSON.stringify({
          type: "result",
          commandId: "wrong",
          instanceId: "ae-test",
          result: '{"_commandId":"wrong"}',
        }),
      );
      socket.send(
        JSON.stringify({
          type: "result",
          commandId: packet.commandId,
          instanceId: "ae-test",
          result: JSON.stringify({ _commandId: packet.commandId, status: "success" }),
        }),
      );
    });
    expect(JSON.parse(await bridge.send(bridge.select()!, "one", "ping", {}, 1000)).status).toBe(
      "success",
    );
  });
  it("does not select an unauthenticated socket", async () => {
    const { bridge, connect } = await fixture();
    await connect("bad", true, "wrong-token");
    expect(bridge.select()).toBeUndefined();
  });
  it("refuses ambiguous instances and paused panels", async () => {
    const { bridge, connect } = await fixture();
    await connect("one", false);
    await expect(bridge.send(bridge.select()!, "paused", "edit", {}, 100)).rejects.toThrow(
      /paused/,
    );
    await connect("two");
    expect(() => bridge.select()).toThrow(/Multiple AE/);
  });
  it("never resends a timed out edit; only its late result restores certainty", async () => {
    const { bridge, connect } = await fixture();
    const socket = await connect();
    let count = 0;
    socket.on("message", () => count++);
    await expect(bridge.send(bridge.select()!, "edit-1", "edit", {}, 25)).rejects.toThrow(
      /outcome unknown/,
    );
    expect(() => bridge.select()).toThrow(/unknown outcome/);
    expect(count).toBe(1);
    socket.send(
      JSON.stringify({
        type: "result",
        instanceId: "ae-test",
        commandId: "edit-1",
        result: '{"_commandId":"edit-1"}',
      }),
    );
    await tick();
    expect(bridge.select()).toBeTruthy();
  });
  it("marks a disconnect after dispatch as unknown", async () => {
    const { bridge, connect } = await fixture();
    const socket = await connect();
    socket.once("message", () => socket.close());
    await expect(bridge.send(bridge.select()!, "edit-2", "edit", {}, 1000)).rejects.toThrow(
      /outcome unknown/,
    );
    expect(() => bridge.select()).toThrow(/unknown outcome/);
  });
});
describe("legacy mailbox ownership", () => {
  it("serializes different clients and retains uncertainty", async () => {
    const { folder } = await fixture();
    const release = await acquireFileLease(folder, "first", 100);
    await expect(acquireFileLease(folder, "second", 20)).rejects.toThrow(/another client/);
    release(true);
    const next = await acquireFileLease(folder, "second", 100);
    next(false);
    await expect(acquireFileLease(folder, "third", 100)).rejects.toThrow(/unknown outcome/);
  });
});
