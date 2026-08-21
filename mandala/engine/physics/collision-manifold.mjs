/**
 * Collision manifold — tiny CPU, defect vs domain bounds and hard occupancy.
 * Status: **partial**. Not a mesh collider.
 */

export const COLLISION_STATUS = "partial";

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

export function inDomain(defect, shape) {
  return (
    defect.x >= 0 &&
    defect.y >= 0 &&
    defect.z >= 0 &&
    defect.x < shape.nx &&
    defect.y < shape.ny &&
    defect.z < shape.nz
  );
}

export function occupancyHit(defect, occupied = []) {
  for (const occ of occupied) {
    if (occ.x === defect.x && occ.y === defect.y && occ.z === defect.z) return occ;
  }
  return null;
}

/**
 * Resolve defect vs AABB walls (bounce = clamp back to last in-domain cell)
 * and hard occupancy (cannot share a cell).
 */
export function resolveDefectCollision(prev, proposed, shape, occupied = []) {
  const bounced = [];
  let x = proposed.x | 0;
  let y = proposed.y | 0;
  let z = proposed.z | 0;

  if (x < 0) {
    x = 0;
    bounced.push("x-min");
  } else if (x >= shape.nx) {
    x = shape.nx - 1;
    bounced.push("x-max");
  }
  if (y < 0) {
    y = 0;
    bounced.push("y-min");
  } else if (y >= shape.ny) {
    y = shape.ny - 1;
    bounced.push("y-max");
  }
  if (z < 0) {
    z = 0;
    bounced.push("z-min");
  } else if (z >= shape.nz) {
    z = shape.nz - 1;
    bounced.push("z-max");
  }

  const candidate = { type: proposed.type, x, y, z };
  if (occupancyHit(candidate, occupied)) {
    bounced.push("occupancy");
    return {
      defect: { type: prev.type, x: prev.x, y: prev.y, z: prev.z },
      bounced,
      resolved: true,
      chebyshev: chebyshev(prev, prev),
    };
  }

  return {
    defect: candidate,
    bounced,
    resolved: true,
    chebyshev: chebyshev(prev, candidate),
  };
}

/**
 * Unresolved out-of-domain or occupancy without bounce → illegal manifold.
 */
export function classifyCollision(prev, proposed, shape, occupied = []) {
  const outside = !inDomain(proposed, shape);
  const occ = occupancyHit(proposed, occupied);
  if (!outside && !occ) {
    return { legal: true, code: null, chebyshev: chebyshev(prev, proposed) };
  }
  return {
    legal: false,
    code: outside ? "unresolved-domain-collision" : "unresolved-occupancy-collision",
    chebyshev: chebyshev(prev, proposed),
    outside,
    occupancy: Boolean(occ),
  };
}

export { chebyshev };
