/**
 * Four RT4D lab modes — must not be collapsed (different invariants).
 *
 * Status: **partial** — enum + defaults + documentation helpers.
 * Not a runtime renderer switch for the full path tracer (opt-in API only).
 */

export const RT4D_LAB_MODES = Object.freeze({
  GEOMETRY: "geometry",
  SPACETIME: "spacetime",
  SIMULATION: "simulation",
  TIMELINE: "timeline",
});

export const DEFAULT_RT4D_LAB_MODE = RT4D_LAB_MODES.GEOMETRY;

/** @typedef {"geometry"|"spacetime"|"simulation"|"timeline"} Rt4dLabMode */

/**
 * @type {Readonly<Record<Rt4dLabMode, {fourthAxis: string, defaultMetricId: string, invariants: string, status: string}>>}
 */
export const RT4D_LAB_MODE_META = Object.freeze({
  geometry: Object.freeze({
    fourthAxis: "spatial_w",
    defaultMetricId: "euclidean",
    invariants: "O(4)-style Euclidean rotations; Transform4D.rotate planes",
    status: "partial",
  }),
  spacetime: Object.freeze({
    fourthAxis: "coordinate_time_t",
    defaultMetricId: "minkowski:-+++",
    invariants: "Lorentz boosts for xt/yt/zt (c=1); spatial xy/xz/yz rotations; prefer natural units",
    status: "partial",
  }),
  simulation: Object.freeze({
    fourthAxis: "state_evolution_index",
    defaultMetricId: "euclidean",
    invariants: "Deterministic rewind/replay of computational state; evolution law hash declared",
    status: "partial",
  }),
  timeline: Object.freeze({
    fourthAxis: "lineage_coordinate",
    defaultMetricId: "euclidean",
    invariants: "Immutable lineage; fork/compare/prune; merge creates new node",
    status: "partial",
  }),
});

/**
 * Three distinct meanings often mislabeled "time travel".
 */
export const TIME_TRAVEL_MEANINGS = Object.freeze({
  SPACETIME_VISUALIZATION: "spacetime_visualization",
  SIMULATION_REWIND: "simulation_rewind",
  TIMELINE_EDITING: "timeline_editing",
});

/**
 * @param {string} mode
 * @returns {mode is Rt4dLabMode}
 */
export function isRt4dLabMode(mode) {
  return Object.values(RT4D_LAB_MODES).includes(mode);
}

/**
 * @param {string} [mode]
 * @returns {Rt4dLabMode}
 */
export function normalizeRt4dLabMode(mode) {
  if (mode && isRt4dLabMode(mode)) return mode;
  return DEFAULT_RT4D_LAB_MODE;
}
