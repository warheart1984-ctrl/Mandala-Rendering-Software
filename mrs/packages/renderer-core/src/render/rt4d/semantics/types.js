/**
 * Layer 4 — physical / lab semantics (Phase-1 thin records).
 * Status: **partial** — typed records only; not a relativity engine.
 */

/**
 * @typedef {object} Event4D
 * @property {string} id
 * @property {{x:number,y:number,z:number,w:number}} p
 * @property {string} [label]
 */

/**
 * @typedef {object} Worldline
 * @property {string} id
 * @property {Event4D[]} events
 */

/**
 * @typedef {object} ObserverFrame
 * @property {"inertial"|"accelerated"|"declared"} type
 * @property {[number, number, number]} [velocity]  // as fraction of c when units==="c"
 * @property {"c"|"natural"} [units]
 */

/**
 * @typedef {object} LightCone
 * @property {string} apexEventId
 * @property {"future"|"past"|"both"} sheet
 * @property {string} metricId
 * @property {"partial"} status
 */

/**
 * @param {string} id
 * @param {{x:number,y:number,z:number,w:number}} p
 * @param {string} [label]
 * @returns {Event4D}
 */
export function createEvent(id, p, label) {
  return { id, p: { x: p.x, y: p.y, z: p.z, w: p.w }, label };
}

/**
 * @param {string} id
 * @param {Event4D[]} events
 * @returns {Worldline}
 */
export function createWorldline(id, events) {
  return { id, events: [...events] };
}
