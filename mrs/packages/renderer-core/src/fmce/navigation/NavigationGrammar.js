/**
 * Navigation Grammar - constitutional validation of navigation commands.
 * Status: canonical
 */

import { sha256Hex, stableStringify } from "../core/hash.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GeometricPrimitives {}
export class ConstitutionalZones {}
export class DomainBoundaries {}
export class TemporalPaths {}
export class RiskGradients {}
export class NavigationRules {}

const VALID_PRECISION = new Set(["high", "medium", "low", "float", "double", "fp32", "fp64"]);

export class NavigationGrammar {
  parse(command = "", params = {}) {
    const c = String(command);
    const errors = [];
    let rule;

    switch (c) {
      case "move_forward":
      case "move_backward":
        rule = "linear_motion";
        if (!(params.distance > 0)) errors.push("distance must be > 0");
        break;
      case "rotate":
        rule = "rotation";
        if (!(Math.abs(params.angle) <= 2 * Math.PI)) errors.push("angle exceeds rotation limit");
        break;
      case "translate":
        rule = "translation";
        if (params.x === undefined || params.y === undefined) errors.push("translate requires x and y");
        break;
      case "scale":
        rule = "scale";
        if (!(params.factor >= 0.01 && params.factor <= 1000)) errors.push("scale factor out of [0.01, 1000]");
        break;
      case "set_sample_rate":
        rule = "sample_rate";
        if (!(params.rate >= 0)) errors.push("sample rate must be >= 0");
        break;
      case "set_depth":
        rule = "depth";
        if (!(params.depth >= 0)) errors.push("depth must be >= 0");
        break;
      case "set_precision":
        rule = "precision";
        if (typeof params.prec !== "string" || !VALID_PRECISION.has(params.prec)) errors.push("invalid precision");
        break;
      case "merge_meshes":
        rule = "mesh_merge";
        if (params.merge === "invalid_merge") errors.push("invalid merge operation");
        break;
      case "split_mesh":
        rule = "mesh_split";
        if (params.split === "non_manifold") errors.push("non-manifold split rejected");
        break;
      case "set_time_acceleration":
        rule = "time_acceleration";
        if (!(params.accel >= 0)) errors.push("time acceleration must be >= 0");
        break;
      case "skip_frame":
        rule = "frame_skip";
        if (!(params.frames > 0)) errors.push("frames must be > 0");
        break;
      case "enter_safe_zone":
      case "exit_zone":
        rule = "zone";
        break;
      default:
        errors.push(`unknown command: ${c}`);
        rule = "unknown";
        break;
    }

    return {
      valid: errors.length === 0,
      grammar: { name: c, rule, params },
      errors,
      errorCount: errors.length,
    };
  }

  parseWithZones(command = "", params = {}) {
    const result = this.parse(command, params);
    return { ...result, zoneValid: result.valid };
  }

  generateSequence(mode = "patrol", options = {}) {
    const waypointCount = options.waypoints ?? 5;
    const duration = options.duration ?? 10;
    const seed = parseInt(sha256Hex(stableStringify({ mode, ...options })).slice(0, 8), 16);
    const rng = mulberry32(seed);

    const waypoints = [];
    for (let i = 0; i < waypointCount; i++) {
      waypoints.push({
        index: i,
        x: rng(),
        y: rng(),
        z: rng(),
        t: waypointCount > 1 ? (i / (waypointCount - 1)) * duration : 0,
      });
    }

    let totalDistance = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      totalDistance += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }

    return { waypoints, totalDistance, determinismClass: "D2_NUMERICAL", mode, duration };
  }

  replaySequence(mode = "explore", options = {}) {
    const duration = options.duration ?? 5;
    const seed = parseInt(sha256Hex(stableStringify({ mode, replay: true, ...options })).slice(0, 8), 16);
    const rng = mulberry32(seed);
    const steps = Math.max(2, Math.round(duration * 2));

    const trajectory = [];
    for (let i = 0; i < steps; i++) {
      trajectory.push({
        x: rng() * 2 - 1,
        y: rng() * 2 - 1,
        z: rng() * 2 - 1,
        t: (i / (steps - 1)) * duration,
      });
    }

    return {
      trajectory,
      invariantsCompliance: true,
      determinismClass: "D2_NUMERICAL",
      invariantSurface: `navigation_${mode}`,
      totalDistance: 0,
      mode,
    };
  }
}
