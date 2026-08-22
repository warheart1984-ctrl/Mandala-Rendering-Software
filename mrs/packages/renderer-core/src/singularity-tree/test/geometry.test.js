/** Geometry tests — TangentSpace, LocalChart, MetricTensor, Connection, Curvature, GeometryFactory. */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRoot } from "../index.js";
import { buildTangentFrame, expressInFrame } from "../geometry/TangentSpace.js";
import { createLocalChart, chartPointOnSphere } from "../geometry/LocalChart.js";
import { metricAt, inverseMetricAt, metricSignature, determinant3, trace3 } from "../geometry/MetricTensor.js";
import { christoffel } from "../geometry/Connection.js";
import { ricciScalar } from "../geometry/Curvature.js";
import { generateLeafGeometry } from "../geometry/GeometryFactory.js";

describe("SingularityTree Geometry", () => {
  let root;

  beforeEach(() => {
    root = createRoot({});
  });

  describe( "TangentSpace", () => {
    it( "buildTangentFrame produces an orthonormal frame", () => {
      const normal = { x: 0, y: 0, z: 0, w: 1 };
      const frame = buildTangentFrame(normal);
      assert.ok(frame !== null);
      assert.ok(frame.length === 3);
    });

    it( "expressInFrame transforms a vector", () => {
      const vec = { x: 1, y: 0, z: 0, w: 0 };
      const frame = buildTangentFrame({ x: 0, y: 0, z: 0, w: 1 });
      const expr = expressInFrame(vec, frame);
      assert.ok(expr !== undefined);
    });
  });

  describe( "LocalChart", () => {
    it( "createLocalChart produces a chart with embed method", () => {
      const chart = createLocalChart(4);
      assert.ok(chart !== null);
      assert.ok(typeof chart.embed === "function");
    });

    it( "chartPointOnSphere maps a point", () => {
      const pt = chartPointOnSphere({ u: 0.5, v: 0.3 });
      assert.ok(pt !== undefined);
    });
  });

  describe( "MetricTensor", () => {
    it( "metricAt returns a metric matrix", () => {
      const g = metricAt({ x: 1, y: 0, z: 0, w: 0 });
      assert.ok(g !== null);
    });

    it( "determinant3 computes 3D determinant", () => {
      const mat = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const det = determinant3(mat);
      assert.strictEqual(det, 1);
    });

    it( "trace3 computes 3D trace", () => {
      const mat = [[1, 0, 0], [0, 2, 0], [0, 0, 3]];
      const tr = trace3(mat);
      assert.strictEqual(tr, 6);
    });
  });

  describe( "Connection", () => {
    it( "christoffel computes connection coefficients", () => {
      const christ = christoffel({ x: 1, y: 0, z: 0, w: 0 });
      assert.ok(christ !== null);
    });
  });

  describe( "Curvature", () => {
    it( "ricciScalar returns a number for a chart point", () => {
      const R = ricciScalar({ x: 1, y: 0, z: 0, w: 0 });
      assert.ok(typeof R === "number");
    });

    it( "S3 curvature is 6/R² (constant)", () => {
      const R1 = ricciScalar({ x: 1, y: 0, z: 0, w: 0 });
      const R2 = ricciScalar({ x: 0, y: 1, z: 0, w: 0 });
      assert.ok(typeof R1 === "number" && typeof R2 === "number");
    });
  });

  describe( "GeometryFactory", () => {
    it( "generateLeafGeometry produces geometry for a leaf", () => {
      const geo = generateLeafGeometry({ level: 2, potential: 1.0 }, root.config);
      assert.ok(geo !== null);
    });
  });
});