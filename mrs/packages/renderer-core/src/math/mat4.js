/**
 * 4D rotation matrices.
 * Each rotation is in one of the 6 planes: XY, XZ, XW, YZ, YW, ZW.
 * Returns a function that rotates a vec4.
 */

function makeRotation(plane, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  switch (plane) {
    case "xy":
      return (p) => ({
        x: c * p.x - s * p.y,
        y: s * p.x + c * p.y,
        z: p.z,
        w: p.w,
      });
    case "xz":
      return (p) => ({
        x: c * p.x - s * p.z,
        y: p.y,
        z: s * p.x + c * p.z,
        w: p.w,
      });
    case "xw":
      return (p) => ({
        x: c * p.x - s * p.w,
        y: p.y,
        z: p.z,
        w: s * p.x + c * p.w,
      });
    case "yz":
      return (p) => ({
        x: p.x,
        y: c * p.y - s * p.z,
        z: s * p.y + c * p.z,
        w: p.w,
      });
    case "yw":
      return (p) => ({
        x: p.x,
        y: c * p.y - s * p.w,
        z: p.z,
        w: s * p.y + c * p.w,
      });
    case "zw":
      return (p) => ({
        x: p.x,
        y: p.y,
        z: c * p.z - s * p.w,
        w: s * p.z + c * p.w,
      });
    default:
      throw new Error(`Unknown rotation plane: ${plane}`);
  }
}

/**
 * Create a combined 4D rotation from multiple planes.
 * @param {Array<{plane: string, angle: number|Function}>} rotations
 * @returns {Function} rotation function: vec4 → vec4
 */
export function composeRotations(rotations) {
  const fns = rotations.map((r) =>
    typeof r.angle === "function"
      ? makeRotation(r.plane, r.angle())
      : makeRotation(r.plane, r.angle)
  );

  return (p) => {
    let result = p;
    for (const fn of fns) {
      result = fn(result);
    }
    return result;
  };
}

/**
 * Default rotation for cinematic 4D motion.
 * Rotates in XW, YZ, ZW, YW with different speeds.
 */
export function cinematicRotation(t, weights = null) {
  const w = weights ?? { xw: 0.7, yz: 1.1, zw: 1.5, yw: 2.0 };
  return composeRotations([
    { plane: "xw", angle: t * w.xw },
    { plane: "yz", angle: t * w.yz },
    { plane: "zw", angle: t * w.zw },
    { plane: "yw", angle: t * w.yw },
  ]);
}
