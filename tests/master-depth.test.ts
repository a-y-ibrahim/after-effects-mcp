import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(
  new URL("../src/scripts/mcp-bridge-auto.jsx", import.meta.url),
  "utf8",
);
const helper = source
  .split("// BEGIN master depth validation")[1]
  .split("// END master depth validation")[0];
function exr(type: number, compression = 3) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(20000630);
  header.writeUInt32LE(2, 4);
  const channel = Buffer.alloc(19);
  channel.write("R\0");
  channel.writeUInt32LE(type, 2);
  channel.writeUInt32LE(1, 10);
  channel.writeUInt32LE(1, 14);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(channel.length);
  return Buffer.concat([
    header,
    Buffer.from("channels\0chlist\0"),
    size,
    channel,
    Buffer.from("compression\0compression\0"),
    Buffer.from([1, 0, 0, 0, compression, 0]),
  ]).toString("latin1");
}
function fixture(bits = 32, format = "OpenEXR Sequence", depth = "Floating Point") {
  let applied = "";
  const module = {
    applyTemplate(name: string) {
      if (name === "missing") throw Error("No template");
      applied = name;
    },
    getSettings() {
      return { Format: format, Depth: depth };
    },
    setSettings() {},
    file: null as any,
  };
  const item = {
    comp: { name: "test" },
    applyTemplate() {},
    setSettings() {},
    getSettings() {
      return { "Color Depth": "Current Settings" };
    },
    outputModule() {
      return module;
    },
  };
  const context = vm.createContext({
    app: { project: { bitsPerChannel: bits } },
    File: class {
      fsName: string;
      constructor(p: string) {
        this.fsName = p;
      }
    },
    getBridgeFolder: () => ({ fsName: "/scratch" }),
    GetSettingsFormat: { STRING: 1 },
  });
  vm.runInContext(helper, context);
  return { context, item, module, applied: () => applied };
}
describe("master precision", () => {
  it.each([8, 16])("reads PNG %i depth from the actual header", (bits) => {
    const png = Buffer.alloc(33);
    png[0] = 137;
    png.write("PNG", 1);
    png.write("IHDR", 12);
    png[24] = bits;
    expect(fixture().context._imageDepth(png.toString("latin1")).bits).toBe(bits);
  });
  it("distinguishes EXR half float from Float32", () => {
    const { context } = fixture();
    expect(context._imageDepth(exr(1)).bits).toBe(16);
    expect(context._imageDepth(exr(2)).bits).toBe(32);
    expect(() => context._imageDepth(exr(0))).toThrow(/not floating/);
    expect(() => context._imageDepth(exr(2).slice(0, 20))).toThrow(/Truncated/);
  });
  it("distinguishes lossless ZIP from lossy DWA and PXR24", () => {
    const { context } = fixture();
    expect(context._imageDepth(exr(2, 3))).toMatchObject({ compression: "ZIP", lossless: true });
    expect(context._imageDepth(exr(2, 9))).toMatchObject({ compression: "DWAB", lossless: false });
    expect(context._imageDepth(exr(2, 5))).toMatchObject({ compression: "PXR24", lossless: false });
  });
  it.each([8, 16, 32])(
    "selects a depth-appropriate default without changing project precision (%i)",
    (bits) => {
      const f = fixture(
        bits,
        bits === 32 ? "OpenEXR Sequence" : "PNG Sequence",
        bits === 8
          ? "Millions of Colors+"
          : bits === 16
            ? "Trillions of Colors+"
            : "Floating Point",
      );
      const result = f.context._configureMasterItem(f.item, {});
      expect(f.applied()).toBe(bits === 32 ? "MCP EXR Float32" : "_HIDDEN X-Factor " + bits);
      expect(result.projectBitsPerChannel).toBe(bits);
      expect(result.outputPath).toContain("[#####]");
      expect(f.context.app.project.bitsPerChannel).toBe(bits);
    },
  );
  it("rejects incompatible paths, lower precision and missing templates", () => {
    const f = fixture();
    expect(() => f.context._configureMasterItem(f.item, { outputPath: "/a.png" })).toThrow(
      /end in .exr/,
    );
    expect(() =>
      f.context._configureMasterItem(f.item, { outputModuleTemplate: "missing" }),
    ).toThrow(/No template/);
    const low = fixture(32, "PNG Sequence", "Millions of Colors+");
    expect(() =>
      low.context._configureMasterItem(low.item, { outputModuleTemplate: "low" }),
    ).toThrow(/does not match/);
  });
});
