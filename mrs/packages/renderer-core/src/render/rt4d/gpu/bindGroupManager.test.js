import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { BindGroupManager } from "./bindGroupManager.js";

before(() => {
  globalThis.GPUBufferUsage ??= { MAP_READ: 1, COPY_DST: 4, COPY_SRC: 2, STORAGE: 8, VERTEX: 16, INDEX: 32, UNIFORM: 64, INDIRECT: 256 };
  globalThis.GPUShaderStage ??= { COMPUTE: 1, VERTEX: 2, FRAGMENT: 4 };
});

function mockDevice() {
  const layoutEntries = [];
  const groupEntries = [];
  let layoutCounter = 0;
  return {
    _layoutEntries: layoutEntries,
    _groupEntries: groupEntries,
    createBindGroupLayout({ entries }) {
      const id = `layout_${layoutCounter++}`;
      layoutEntries.push({ id, entries });
      return { _id: id };
    },
    createBindGroup({ layout, entries }) {
      groupEntries.push({ layoutId: layout._id, entries });
      return {};
    },
  };
}

function mockBuf(name) {
  return { _name: name, size: 256, usage: 8, destroy() {} };
}

describe("BindGroupManager", () => {
  it("constructor initializes empty caches", () => {
    const mgr = new BindGroupManager(mockDevice());
    assert.equal(Object.keys(mgr._layouts).length, 0);
    assert.equal(Object.keys(mgr._groups).length, 0);
  });

  it("createRaygenLayout creates and caches layout", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    const l1 = mgr.createRaygenLayout();
    const l2 = mgr.createRaygenLayout();
    assert.equal(l1, l2); // cached
    assert.equal(device._layoutEntries.length, 1);
    assert.equal(device._layoutEntries[0].entries.length, 5);
  });

  it("createBVHLayout creates layout with 11 bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    mgr.createBVHLayout();
    assert.equal(device._layoutEntries[0].entries.length, 11);
  });

  it("createShadeLayout creates layout with 9 bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    mgr.createShadeLayout();
    assert.equal(device._layoutEntries[0].entries.length, 9);
  });

  it("createAccumLayout creates layout with 3 bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    mgr.createAccumLayout();
    assert.equal(device._layoutEntries[0].entries.length, 3);
  });

  it("all layouts created independently once", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    mgr.createRaygenLayout();
    mgr.createBVHLayout();
    mgr.createShadeLayout();
    mgr.createAccumLayout();
    assert.equal(device._layoutEntries.length, 4);
    // Calling again should not create new layouts
    mgr.createRaygenLayout();
    mgr.createBVHLayout();
    assert.equal(device._layoutEntries.length, 4);
  });

  it("createRaygenGroup creates bind group with correct bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    const bufs = {
      camera: mockBuf("cam"),
      rayOrigins: mockBuf("ro"),
      rayDirs: mockBuf("rd"),
      rayTMin: mockBuf("tmin"),
      rayTMax: mockBuf("tmax"),
    };
    mgr.createRaygenGroup(bufs);
    assert.equal(device._groupEntries.length, 1);
    const entries = device._groupEntries[0].entries;
    assert.equal(entries.length, 5);
    assert.equal(entries[0].binding, 0);
    assert.equal(entries[1].binding, 1);
    assert.equal(entries[4].binding, 4);
  });

  it("createBVHGroup creates bind group with 11 bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    const bufs = {
      nodes: mockBuf("n"), spheres: mockBuf("s"), planes: mockBuf("p"),
      meshTris: mockBuf("m"), primType: mockBuf("pt"), primOffset: mockBuf("po"),
      rayOrigins: mockBuf("ro"), rayDirs: mockBuf("rd"),
      rayTMin: mockBuf("tmin"), rayTMax: mockBuf("tmax"), hits: mockBuf("h"),
    };
    mgr.createBVHGroup(bufs);
    assert.equal(device._groupEntries[0].entries.length, 11);
  });

  it("createShadeGroup creates bind group with 9 bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    const bufs = {
      frameParams: mockBuf("fp"), hits: mockBuf("h"), materials: mockBuf("m"),
      lights: mockBuf("l"), rayDirs: mockBuf("rd"), rayOrigins: mockBuf("ro"),
      rayOriginsOut: mockBuf("roo"), scatterDirs: mockBuf("sd"), pathThroughput: mockBuf("pt"),
    };
    mgr.createShadeGroup(bufs);
    assert.equal(device._groupEntries[0].entries.length, 9);
  });

  it("createAccumGroup creates bind group with 3 bindings", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    const bufs = {
      accumBuffer: mockBuf("ab"), outputBuffer: mockBuf("ob"), frameParams: mockBuf("fp"),
    };
    mgr.createAccumGroup(bufs);
    assert.equal(device._groupEntries[0].entries.length, 3);
  });

  it("createRaygenGroup uses cached layout", () => {
    const device = mockDevice();
    const mgr = new BindGroupManager(device);
    const bufs = {
      camera: mockBuf("cam"), rayOrigins: mockBuf("ro"), rayDirs: mockBuf("rd"),
      rayTMin: mockBuf("tmin"), rayTMax: mockBuf("tmax"),
    };
    mgr.createRaygenGroup(bufs);
    mgr.createRaygenGroup(bufs);
    // Two groups created but only one layout
    assert.equal(device._groupEntries.length, 2);
    assert.equal(device._layoutEntries.length, 1);
  });
});
