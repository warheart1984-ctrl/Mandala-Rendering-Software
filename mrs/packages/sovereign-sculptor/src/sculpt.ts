import { assertFiniteDeep, sha256Canonical } from "./canonical.js";
import type {
  MaskOperation,
  MoveOperation,
  RotateOperation,
  ScaleOperation,
  SculptDocument,
  SculptMask,
  SculptOperation,
  SculptOperationRecord,
  SculptRegion,
  SculptSymmetry,
  SculptTriangle,
  SculptValidationIssue,
  SculptValidationResult,
  SculptVertex,
  SoftSelection,
  SubdivideOperation,
  Vec3,
} from "./types.js";

const EPSILON = 1e-9;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function copyVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function copyVertex(vertex: SculptVertex): SculptVertex {
  return { id: vertex.id, position: copyVec3(vertex.position) };
}

function copyTriangle(triangle: SculptTriangle): SculptTriangle {
  return {
    id: triangle.id,
    vertexIndices: [
      triangle.vertexIndices[0],
      triangle.vertexIndices[1],
      triangle.vertexIndices[2],
    ],
    regionId: triangle.regionId,
  };
}

function copyRegion(region: SculptRegion): SculptRegion {
  return { id: region.id, vertexIndices: [...region.vertexIndices] };
}

function copyMask(mask: SculptMask): SculptMask {
  return { id: mask.id, weights: [...mask.weights] };
}

function finiteVec3(value: Vec3, label: string): void {
  if (value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`${label} must contain three finite numbers`);
  }
}

function selectionWeights(document: SculptDocument, selection?: SoftSelection): number[] {
  const count = document.vertices.length;
  if (!selection) return Array.from({ length: count }, () => 1);
  assertFiniteDeep(selection);

  const weights = Array.from({ length: count }, () => 1);
  if (selection.vertexWeights) {
    if (selection.vertexWeights.length !== count) {
      throw new Error("selection.vertexWeights length must match vertices");
    }
    for (let index = 0; index < count; index++) {
      weights[index]! *= clamp01(selection.vertexWeights[index] ?? 0);
    }
  }

  if (selection.maskId) {
    const mask = document.masks.find((candidate) => candidate.id === selection.maskId);
    if (!mask) throw new Error(`unknown mask ${selection.maskId}`);
    for (let index = 0; index < count; index++) {
      weights[index]! *= clamp01(mask.weights[index] ?? 0);
    }
  }

  if (selection.regionIds) {
    const allowed = new Set<number>();
    for (const regionId of selection.regionIds) {
      const region = document.regions.find((candidate) => candidate.id === regionId);
      if (!region) throw new Error(`unknown region ${regionId}`);
      region.vertexIndices.forEach((index) => allowed.add(index));
    }
    for (let index = 0; index < count; index++) {
      if (!allowed.has(index)) weights[index] = 0;
    }
  }

  if (selection.center || selection.radius !== undefined) {
    if (!selection.center || !(selection.radius && selection.radius > 0)) {
      throw new Error("radial selection requires center and radius > 0");
    }
    finiteVec3(selection.center, "selection.center");
    for (let index = 0; index < count; index++) {
      const [x, y, z] = document.vertices[index]!.position;
      const distance = Math.hypot(
        x - selection.center[0],
        y - selection.center[1],
        z - selection.center[2],
      );
      let radial = clamp01(1 - distance / selection.radius);
      if (selection.falloff === "smoothstep") radial = radial * radial * (3 - 2 * radial);
      weights[index]! *= radial;
    }
  }

  const strength = selection.strength ?? 1;
  if (!Number.isFinite(strength) || strength < 0) {
    throw new Error("selection.strength must be finite and >= 0");
  }
  return weights.map((weight) => clamp01(weight * strength));
}

function symmetricalWeights(
  document: SculptDocument,
  input: readonly number[],
  symmetry: SculptSymmetry = "none",
): number[] {
  const output = [...input];
  if (symmetry === "none") return output;
  for (let index = 0; index < document.vertices.length; index++) {
    const position = document.vertices[index]!.position;
    let partner = -1;
    let best = Infinity;
    for (let candidate = 0; candidate < document.vertices.length; candidate++) {
      const other = document.vertices[candidate]!.position;
      const distance =
        Math.abs(other[0] + position[0]) +
        Math.abs(other[1] - position[1]) +
        Math.abs(other[2] - position[2]);
      if (distance < best) {
        best = distance;
        partner = candidate;
      }
    }
    if (partner >= 0 && best <= EPSILON) {
      const shared = Math.max(output[index] ?? 0, output[partner] ?? 0);
      output[index] = shared;
      output[partner] = shared;
    }
  }
  return output;
}

function operationWeights(document: SculptDocument, operation: SculptOperation): number[] {
  return symmetricalWeights(
    document,
    selectionWeights(document, operation.selection),
    operation.symmetry,
  );
}

function mirrorVectorForX(value: Vec3, symmetry: SculptSymmetry | undefined): Vec3 {
  return symmetry === "x" ? [-value[0], value[1], value[2]] : value;
}

/** Euler angles are axial vectors, so reflection signs differ from translation. */
function mirrorEulerForX(value: Vec3): Vec3 {
  return [value[0], -value[1], -value[2]];
}

function mirroredPivotForVertex(
  document: SculptDocument,
  index: number,
  pivot: Vec3,
  symmetry: SculptSymmetry | undefined,
): Vec3 {
  return symmetry === "x" && document.vertices[index]!.position[0] < -EPSILON
    ? [-pivot[0], pivot[1], pivot[2]]
    : pivot;
}

function operationDeltaForVertex(
  document: SculptDocument,
  index: number,
  delta: Vec3,
  symmetry: SculptSymmetry | undefined,
): Vec3 {
  if (symmetry !== "x" || document.vertices[index]!.position[0] >= -EPSILON) return delta;
  return mirrorVectorForX(delta, symmetry);
}

function moveVertices(document: SculptDocument, operation: MoveOperation): SculptVertex[] {
  finiteVec3(operation.delta, "move.delta");
  const weights = operationWeights(document, operation);
  return document.vertices.map((vertex, index) => {
    const delta = operationDeltaForVertex(document, index, operation.delta, operation.symmetry);
    const weight = weights[index] ?? 0;
    return {
      id: vertex.id,
      position: [
        vertex.position[0] + delta[0] * weight,
        vertex.position[1] + delta[1] * weight,
        vertex.position[2] + delta[2] * weight,
      ],
    };
  });
}

function scaleVertices(document: SculptDocument, operation: ScaleOperation): SculptVertex[] {
  finiteVec3(operation.factors, "scale.factors");
  const pivot = operation.pivot ?? ([0, 0, 0] as const);
  finiteVec3(pivot, "scale.pivot");
  const weights = operationWeights(document, operation);
  return document.vertices.map((vertex, index) => {
    const weight = weights[index] ?? 0;
    const vertexPivot = mirroredPivotForVertex(document, index, pivot, operation.symmetry);
    const factors = operation.factors;
    return {
      id: vertex.id,
      position: [
        vertexPivot[0] + (vertex.position[0] - vertexPivot[0]) * (1 + (factors[0] - 1) * weight),
        vertexPivot[1] + (vertex.position[1] - vertexPivot[1]) * (1 + (factors[1] - 1) * weight),
        vertexPivot[2] + (vertex.position[2] - vertexPivot[2]) * (1 + (factors[2] - 1) * weight),
      ],
    };
  });
}

function rotatePoint(position: Vec3, pivot: Vec3, radians: Vec3): Vec3 {
  let x = position[0] - pivot[0];
  let y = position[1] - pivot[1];
  let z = position[2] - pivot[2];
  const [sx, cx] = [Math.sin(radians[0]), Math.cos(radians[0])];
  const [sy, cy] = [Math.sin(radians[1]), Math.cos(radians[1])];
  const [sz, cz] = [Math.sin(radians[2]), Math.cos(radians[2])];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

function rotateVertices(document: SculptDocument, operation: RotateOperation): SculptVertex[] {
  finiteVec3(operation.radians, "rotate.radians");
  const pivot = operation.pivot ?? ([0, 0, 0] as const);
  finiteVec3(pivot, "rotate.pivot");
  const weights = operationWeights(document, operation);
  return document.vertices.map((vertex, index) => {
    const reflected = operation.symmetry === "x" && vertex.position[0] < -EPSILON;
    const radians = reflected ? mirrorEulerForX(operation.radians) : operation.radians;
    const vertexPivot = mirroredPivotForVertex(document, index, pivot, operation.symmetry);
    const rotated = rotatePoint(vertex.position, vertexPivot, radians);
    const weight = weights[index] ?? 0;
    return {
      id: vertex.id,
      position: [
        vertex.position[0] + (rotated[0] - vertex.position[0]) * weight,
        vertex.position[1] + (rotated[1] - vertex.position[1]) * weight,
        vertex.position[2] + (rotated[2] - vertex.position[2]) * weight,
      ],
    };
  });
}

function applyMask(document: SculptDocument, operation: MaskOperation): SculptMask[] {
  if (!Number.isFinite(operation.value)) throw new Error("mask.value must be finite");
  const influence = operationWeights(document, operation);
  const existing = document.masks.find((mask) => mask.id === operation.maskId);
  const weights = existing
    ? [...existing.weights]
    : Array.from({ length: document.vertices.length }, () => 0);
  for (let index = 0; index < weights.length; index++) {
    const selected = influence[index] ?? 0;
    const current = weights[index] ?? 0;
    if (operation.mode === "set") {
      weights[index] = clamp01(current * (1 - selected) + operation.value * selected);
    } else if (operation.mode === "add") {
      weights[index] = clamp01(current + operation.value * selected);
    } else {
      weights[index] = clamp01(current - operation.value * selected);
    }
  }
  const updated: SculptMask = { id: operation.maskId, weights };
  return existing
    ? document.masks.map((mask) => (mask.id === operation.maskId ? updated : copyMask(mask)))
    : [...document.masks.map(copyMask), updated];
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function subdivide(document: SculptDocument, operation: SubdivideOperation): {
  vertices: SculptVertex[];
  triangles: SculptTriangle[];
  regions: SculptRegion[];
  masks: SculptMask[];
} {
  const threshold = operation.threshold ?? 0.5;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("subdivide.threshold must be in [0, 1]");
  }
  const weights = operationWeights(document, operation);
  const vertices = document.vertices.map(copyVertex);
  const masks = document.masks.map(copyMask).map((mask) => ({
    ...mask,
    weights: [...mask.weights],
  }));
  const midpointByEdge = new Map<string, number>();
  const regionMembers = new Map(document.regions.map((region) => [region.id, new Set(region.vertexIndices)]));

  const midpoint = (a: number, b: number, regionId: string): number => {
    const key = edgeKey(a, b);
    const found = midpointByEdge.get(key);
    if (found !== undefined) {
      regionMembers.get(regionId)?.add(found);
      return found;
    }
    const pa = vertices[a]!.position;
    const pb = vertices[b]!.position;
    const index = vertices.length;
    vertices.push({
      id: `v${index}`,
      position: [
        (pa[0] + pb[0]) / 2,
        (pa[1] + pb[1]) / 2,
        (pa[2] + pb[2]) / 2,
      ],
    });
    midpointByEdge.set(key, index);
    regionMembers.get(regionId)?.add(index);
    masks.forEach((mask) => (mask.weights as number[]).push(
      ((mask.weights[a] ?? 0) + (mask.weights[b] ?? 0)) / 2,
    ));
    return index;
  };

  const triangles: SculptTriangle[] = [];
  document.triangles.forEach((triangle) => {
    const [a, b, c] = triangle.vertexIndices;
    const mean = ((weights[a] ?? 0) + (weights[b] ?? 0) + (weights[c] ?? 0)) / 3;
    if (mean < threshold) {
      triangles.push(copyTriangle(triangle));
      return;
    }
    const ab = midpoint(a, b, triangle.regionId);
    const bc = midpoint(b, c, triangle.regionId);
    const ca = midpoint(c, a, triangle.regionId);
    const faces: readonly (readonly [number, number, number])[] = [
      [a, ab, ca],
      [ab, b, bc],
      [ca, bc, c],
      [ab, bc, ca],
    ];
    faces.forEach((indices, subIndex) => triangles.push({
      id: `${triangle.id}.s${subIndex}`,
      vertexIndices: indices,
      regionId: triangle.regionId,
    }));
  });

  const regions = document.regions.map((region) => ({
    id: region.id,
    vertexIndices: Array.from(regionMembers.get(region.id) ?? []).sort((a, b) => a - b),
  }));
  return { vertices, triangles, regions, masks };
}

function appendRecord(
  records: readonly SculptOperationRecord[],
  operation: SculptOperation,
): SculptOperationRecord[] {
  if (records.some((record) => record.id === operation.id)) {
    throw new Error(`duplicate operation id ${operation.id}`);
  }
  return [
    ...records,
    { id: operation.id, kind: operation.kind, operationHash: sha256Canonical(operation) },
  ];
}

function topologyPayload(document: SculptDocument): unknown {
  return {
    vertexIds: document.vertices.map((vertex) => vertex.id),
    triangles: document.triangles.map((triangle) => ({
      id: triangle.id,
      vertexIndices: triangle.vertexIndices,
      regionId: triangle.regionId,
    })),
    regions: document.regions.map((region) => ({
      id: region.id,
      vertexIndices: region.vertexIndices,
    })),
  };
}

/** Hashes connectivity and stable ordering, deliberately excluding vertex positions. */
export function sculptTopologyDigest(document: SculptDocument): string {
  return sha256Canonical(topologyPayload(document));
}

function topologyLockEvidence(document: SculptDocument): SculptOperationRecord {
  const evidence = {
    kind: "lock-topology" as const,
    documentId: document.id,
    topologyRevision: document.topologyRevision,
    topologyDigest: sculptTopologyDigest(document),
  };
  return {
    id: `topology-lock:r${document.topologyRevision}`,
    kind: evidence.kind,
    operationHash: sha256Canonical(evidence),
  };
}

export function validateSculptDocument(document: SculptDocument): SculptValidationResult {
  const issues: SculptValidationIssue[] = [];
  try {
    assertFiniteDeep(document);
  } catch (error) {
    issues.push({ code: "non-finite", message: String((error as Error).message) });
  }
  if (document.schemaVersion !== "sovereign-sculpt/1.0"
    || document.status !== "core-enforced-fixture-not-production-sculpt") {
    issues.push({ code: "document-contract", message: "unsupported SculptDocument schema/status" });
  }
  if (document.topologyState !== "authoring" && document.topologyState !== "locked") {
    issues.push({ code: "topology-state", message: "topologyState must be authoring or locked" });
  }
  if (!Number.isInteger(document.topologyRevision) || document.topologyRevision < 0) {
    issues.push({ code: "topology-revision", message: "topologyRevision must be a nonnegative integer" });
  }
  if (document.parentTopologyDigest !== undefined
    && !/^[0-9a-f]{64}$/.test(document.parentTopologyDigest)) {
    issues.push({ code: "parent-topology-digest", message: "parentTopologyDigest must be lower-case SHA-256" });
  }
  if (!document.id?.trim() || !document.identity?.id?.trim() || !document.identity?.displayName?.trim()) {
    issues.push({ code: "missing-document-identity", message: "document and identity ids/names are required" });
  }
  if (!document.identity?.gender?.identity.trim()) {
    issues.push({ code: "missing-gender-identity", message: "identity.gender.identity is required" });
  }
  if ("gender" in (document.morphologyProfile as object)) {
    issues.push({
      code: "gender-in-morphology",
      message: "gender metadata must remain separate from morphologyProfile",
    });
  }
  for (const [key, value] of Object.entries(document.morphologyProfile)) {
    if (typeof value !== "number" || value < 0 || value > 1) {
      issues.push({
        code: "morphology-range",
        message: `morphologyProfile.${key} must be in [0, 1]`,
        path: `morphologyProfile.${key}`,
      });
    }
  }
  const vertexIds = new Set<string>();
  document.vertices.forEach((vertex, index) => {
    if (!vertex.id || vertexIds.has(vertex.id)) {
      issues.push({ code: "invalid-vertex-id", message: `duplicate/empty vertex id ${vertex.id}`, path: `vertices[${index}]` });
    }
    vertexIds.add(vertex.id);
  });
  const triangleIds = new Set<string>();
  document.triangles.forEach((triangle, index) => {
    if (!triangle.id || triangleIds.has(triangle.id)) {
      issues.push({ code: "invalid-triangle-id", message: `duplicate/empty triangle id ${triangle.id}`, path: `triangles[${index}]` });
    }
    triangleIds.add(triangle.id);
    for (const vertexIndex of triangle.vertexIndices) {
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= document.vertices.length) {
        issues.push({ code: "triangle-index-out-of-range", message: `${triangle.id} references ${vertexIndex}`, path: `triangles[${index}]` });
      }
    }
    if (new Set(triangle.vertexIndices).size !== 3) {
      issues.push({ code: "degenerate-triangle", message: `${triangle.id} repeats a vertex`, path: `triangles[${index}]` });
    }
  });
  const regionIds = new Set<string>();
  document.regions.forEach((region, index) => {
    if (!region.id || regionIds.has(region.id)) {
      issues.push({ code: "invalid-region-id", message: `duplicate/empty region id ${region.id}`, path: `regions[${index}]` });
    }
    regionIds.add(region.id);
    if (region.vertexIndices.some((entry) => !Number.isInteger(entry) || entry < 0 || entry >= document.vertices.length)) {
      issues.push({ code: "region-index-out-of-range", message: `${region.id} has invalid vertex index`, path: `regions[${index}]` });
    }
  });
  document.triangles.forEach((triangle, index) => {
    if (!regionIds.has(triangle.regionId)) {
      issues.push({ code: "unknown-triangle-region", message: `${triangle.id} uses ${triangle.regionId}`, path: `triangles[${index}]` });
    }
  });
  const maskIds = new Set<string>();
  document.masks.forEach((mask, index) => {
    if (!mask.id || maskIds.has(mask.id)) {
      issues.push({ code: "invalid-mask-id", message: `duplicate/empty mask id ${mask.id}`, path: `masks[${index}]` });
    }
    maskIds.add(mask.id);
    if (mask.weights.length !== document.vertices.length) {
      issues.push({ code: "mask-length", message: `${mask.id} must align with vertices`, path: `masks[${index}]` });
    }
    if (mask.weights.some((weight) => weight < 0 || weight > 1)) {
      issues.push({ code: "mask-weight-range", message: `${mask.id} weights must be in [0, 1]`, path: `masks[${index}]` });
    }
  });
  const operationIds = new Set<string>();
  document.operationLog.forEach((record, index) => {
    if (!record.id || operationIds.has(record.id)) {
      issues.push({ code: "invalid-operation-id", message: `duplicate/empty operation id ${record.id}`, path: `operationLog[${index}]` });
    }
    operationIds.add(record.id);
    if (!/^[0-9a-f]{64}$/.test(record.operationHash)) {
      issues.push({ code: "invalid-operation-hash", message: `${record.id} hash must be lower-case SHA-256`, path: `operationLog[${index}]` });
    }
  });
  if (document.topologyState === "locked") {
    const expected = topologyLockEvidence(document);
    const lockRecord = document.operationLog.find((record) => record.kind === "lock-topology");
    if (!lockRecord) {
      issues.push({ code: "missing-topology-lock", message: "locked topology requires operation evidence" });
    } else if (lockRecord.id !== expected.id || lockRecord.operationHash !== expected.operationHash) {
      issues.push({ code: "invalid-topology-lock", message: "topology lock evidence does not match current topology" });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertValidSculptDocument(document: SculptDocument): void {
  const result = validateSculptDocument(document);
  if (!result.ok) {
    throw new Error(`invalid SculptDocument: ${result.issues.map((issue) => issue.code).join(", ")}`);
  }
}

/** Pure operation application. Inputs are never mutated. */
export function applySculptOperation(
  document: SculptDocument,
  operation: SculptOperation,
): SculptDocument {
  assertValidSculptDocument(document);
  assertFiniteDeep(operation);
  let vertices = document.vertices.map(copyVertex);
  let triangles = document.triangles.map(copyTriangle);
  let regions = document.regions.map(copyRegion);
  let masks = document.masks.map(copyMask);

  if (operation.kind === "move") vertices = moveVertices(document, operation);
  else if (operation.kind === "scale") vertices = scaleVertices(document, operation);
  else if (operation.kind === "rotate") vertices = rotateVertices(document, operation);
  else if (operation.kind === "mask") masks = applyMask(document, operation);
  else {
    if (document.topologyState !== "authoring") {
      throw new Error("subdivide is permitted only while topologyState is authoring");
    }
    const result = subdivide(document, operation);
    vertices = result.vertices;
    triangles = result.triangles;
    regions = result.regions;
    masks = result.masks;
  }

  const next: SculptDocument = {
    ...document,
    vertices,
    triangles,
    regions,
    masks,
    operationLog: appendRecord(document.operationLog, operation),
    ...(operation.kind === "subdivide" ? {
      topologyRevision: document.topologyRevision + 1,
      parentTopologyDigest: sculptTopologyDigest(document),
    } : {}),
  };
  assertValidSculptDocument(next);
  return next;
}

/**
 * Irreversibly closes authoring-time topology changes for export/runtime use.
 * Geometry, connectivity, ordering, and revision are preserved exactly.
 */
export function lockSculptTopology(document: SculptDocument): SculptDocument {
  assertValidSculptDocument(document);
  if (document.topologyState === "locked") return document;
  const evidence = topologyLockEvidence(document);
  if (document.operationLog.some((record) => record.id === evidence.id)) {
    throw new Error(`duplicate operation id ${evidence.id}`);
  }
  const locked: SculptDocument = {
    ...document,
    topologyState: "locked",
    operationLog: [...document.operationLog, evidence],
  };
  assertValidSculptDocument(locked);
  return locked;
}

export function applySculptOperations(
  document: SculptDocument,
  operations: readonly SculptOperation[],
): SculptDocument {
  return operations.reduce(applySculptOperation, document);
}

export function sculptDocumentHash(document: SculptDocument): string {
  assertValidSculptDocument(document);
  return sha256Canonical(document);
}
