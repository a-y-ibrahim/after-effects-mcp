import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
const source = fs.readFileSync(
  new URL("../src/scripts/mcp-bridge-auto.jsx", import.meta.url),
  "utf8",
);
const helper = source.split("// BEGIN scene inspection")[1].split("// END scene inspection")[0];
function fixture() {
  class CompItem {
    width = 1920;
    height = 1080;
    frameRate = 30;
    duration = 10;
    workAreaStart = 2;
    workAreaDuration = 4;
    time = 3;
    layers: any[] = [];
    constructor(
      public id: number,
      public name: string,
    ) {}
    get numLayers() {
      return this.layers.length;
    }
    layer(i: number) {
      return this.layers[i - 1];
    }
  }
  class TextLayer {}
  const root = new CompItem(1, "same"),
    child = new CompItem(2, "same");
  const layer = (id: number, src: any) => ({
    id,
    index: id,
    name: "same",
    source: src,
    enabled: true,
    solo: false,
    parent: null,
    numProperties: 0,
    property: () => null,
  });
  root.layers = [
    layer(11, child),
    layer(12, child),
    layer(13, { id: 3, name: "missing", file: { fsName: "/missing.mov" }, footageMissing: true }),
  ];
  child.layers = [layer(21, root)];
  const project = {
    bitsPerChannel: 32,
    file: { fsName: "/project.aep" },
    numItems: 2,
    item: (i: number) => [root, child][i - 1],
  };
  const context = vm.createContext({
    app: { project },
    CompItem,
    TextLayer,
    TrackMatteType: {},
    enumName: () => "NO_TRACK_MATTE",
    _resolveComp: (a: any) => (a.compId === 2 ? child : root),
    _layerTypeName: () => "AVLayer",
    getLayerFull: (a: any) =>
      JSON.stringify(
        a.layerIndex === 99
          ? { status: "error", error: "not found" }
          : { status: "success", layer: { index: a.layerIndex, keys: a.includeKeyframes } },
      ),
  });
  vm.runInContext(helper, context);
  return { context, root, child };
}
describe("scene graph host collector", () => {
  it("deduplicates reused compositions, handles cycles and keeps duplicate names distinct", () => {
    const f = fixture(),
      r = JSON.parse(f.context.inspectScene({}));
    expect(r.nodes.filter((n: any) => n.kind === "composition").map((n: any) => n.id)).toEqual([
      1, 2,
    ]);
    expect(r.nodes.filter((n: any) => n.kind === "layer")).toHaveLength(4);
    expect(r.nodes.find((n: any) => n.id === 13).source.missing).toBe(true);
    expect(r.nodes.find((n: any) => n.id === 11).source.id).toBe(2);
    expect(r.projectBitsPerChannel).toBe(32);
  });
  it("flags incomplete graphs rather than silently dropping layers", () => {
    const f = fixture(),
      r = JSON.parse(f.context.inspectScene({ maxNodes: 2 }));
    expect(r.truncated).toBe(true);
    expect(r.nodes).toHaveLength(2);
  });
  it("fresh scans pick up manual renames and report per-layer failures", () => {
    const f = fixture();
    f.root.layers[0].name = "manual edit";
    expect(JSON.parse(f.context.inspectScene({})).nodes[1].name).toBe("manual edit");
    const r = JSON.parse(f.context.inspectLayers({ layerIndices: [1, 99] }));
    expect(r.partialFailure).toBe(true);
    expect(r.results[0].layer.keys).toBe(false);
    expect(r.results[1].status).toBe("error");
  });
});
