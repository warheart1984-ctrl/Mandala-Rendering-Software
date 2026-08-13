/**
 * Axiom Vision — L4 Spatial Relations.
 *
 * Derives spatial relationships between L3 detections (or L2 regions).
 * Relations include: above, below, left, right, inside, contains, overlapping, near.
 *
 * Constitutional status: Level 4 = inference (derived from L3 learned model outputs).
 * Deterministic given L3 inputs, but inherits L3's learned-model uncertainty.
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

/**
 * Compute spatial relations between detections.
 *
 * @param {Object[]} detections - L3 detection evidence objects (or L2 regions with bounding boxes)
 * @param {Object} imageRef - { width, height }
 * @param {string[]} parentHashes - Hashes of L3 features
 * @returns {Object[]} Array of L4 relation evidence objects
 */
export function computeSpatialRelations(detections, imageRef, parentHashes = []) {
  if (!detections || detections.length < 2) return [];

  const relations = [];

  for (let i = 0; i < detections.length; i++) {
    for (let j = i + 1; j < detections.length; j++) {
      const a = detections[i];
      const b = detections[j];

      const boxA = a.geometry?.bounding_box || a.bounding_box;
      const boxB = b.geometry?.bounding_box || b.bounding_box;

      if (!boxA || !boxB) continue;

      const rels = computePairRelations(a, b, boxA, boxB, imageRef);
      for (const rel of rels) {
        relations.push(buildEvidence({
          level: 4,
          type: "spatial_relation",
          method: "bbox-geometry",
          method_version: "1.0.0",
          parent_features: [a.feature_id, b.feature_id],
          parent_hashes: parentHashes,
          confidence: rel.confidence,
          extra: {
            subject: a.feature_id,
            relation: rel.relation,
            object: b.feature_id,
            evidence: rel.evidence,
            distance: rel.distance || null,
          },
        }));
      }
    }
  }

  return relations;
}

/**
 * Compute relations between a pair of bounding boxes.
 */
function computePairRelations(a, b, boxA, boxB, imageRef) {
  const relations = [];
  const area = imageRef.width * imageRef.height;

  // Center points
  const cxA = boxA.x + boxA.w / 2;
  const cyA = boxA.y + boxA.h / 2;
  const cxB = boxB.x + boxB.w / 2;
  const cyB = boxB.y + boxB.h / 2;

  // Vertical relations (emit both directions)
  if (boxA.y + boxA.h <= boxB.y) {
    const gap = boxB.y - (boxA.y + boxA.h);
    relations.push({
      relation: "above",
      confidence: computeVerticalConfidence(boxA, boxB, imageRef.height),
      evidence: { subject_bbox: boxA, object_bbox: boxB, vertical_offset: gap, intersection: 0 },
      distance: gap,
    });
    relations.push({
      relation: "below",
      confidence: computeVerticalConfidence(boxA, boxB, imageRef.height),
      evidence: { subject_bbox: boxB, object_bbox: boxA, vertical_offset: gap, intersection: 0 },
      distance: gap,
    });
  } else if (boxB.y + boxB.h <= boxA.y) {
    const gap = boxA.y - (boxB.y + boxB.h);
    relations.push({
      relation: "below",
      confidence: computeVerticalConfidence(boxA, boxB, imageRef.height),
      evidence: { subject_bbox: boxA, object_bbox: boxB, vertical_offset: gap, intersection: 0 },
      distance: gap,
    });
    relations.push({
      relation: "above",
      confidence: computeVerticalConfidence(boxA, boxB, imageRef.height),
      evidence: { subject_bbox: boxB, object_bbox: boxA, vertical_offset: gap, intersection: 0 },
      distance: gap,
    });
  }

  // Horizontal relations (emit both directions)
  if (boxA.x + boxA.w <= boxB.x) {
    const gap = boxB.x - (boxA.x + boxA.w);
    relations.push({
      relation: "left_of",
      confidence: computeHorizontalConfidence(boxA, boxB, imageRef.width),
      evidence: { subject_bbox: boxA, object_bbox: boxB, horizontal_offset: gap, intersection: 0 },
      distance: gap,
    });
    relations.push({
      relation: "right_of",
      confidence: computeHorizontalConfidence(boxA, boxB, imageRef.width),
      evidence: { subject_bbox: boxB, object_bbox: boxA, horizontal_offset: gap, intersection: 0 },
      distance: gap,
    });
  } else if (boxB.x + boxB.w <= boxA.x) {
    const gap = boxA.x - (boxB.x + boxB.w);
    relations.push({
      relation: "right_of",
      confidence: computeHorizontalConfidence(boxA, boxB, imageRef.width),
      evidence: { subject_bbox: boxA, object_bbox: boxB, horizontal_offset: gap, intersection: 0 },
      distance: gap,
    });
    relations.push({
      relation: "left_of",
      confidence: computeHorizontalConfidence(boxA, boxB, imageRef.width),
      evidence: { subject_bbox: boxB, object_bbox: boxA, horizontal_offset: gap, intersection: 0 },
      distance: gap,
    });
  }

  // Containment (emit both directions)
  if (isInside(boxA, boxB)) {
    relations.push({
      relation: "inside",
      confidence: 0.99,
      evidence: { subject_bbox: boxA, object_bbox: boxB, containment_ratio: (boxA.w * boxA.h) / (boxB.w * boxB.h) },
    });
    relations.push({
      relation: "contains",
      confidence: 0.99,
      evidence: { subject_bbox: boxB, object_bbox: boxA, containment_ratio: (boxA.w * boxA.h) / (boxB.w * boxB.h) },
    });
  } else if (isInside(boxB, boxA)) {
    relations.push({
      relation: "contains",
      confidence: 0.99,
      evidence: { subject_bbox: boxA, object_bbox: boxB, containment_ratio: (boxB.w * boxB.h) / (boxA.w * boxA.h) },
    });
    relations.push({
      relation: "inside",
      confidence: 0.99,
      evidence: { subject_bbox: boxB, object_bbox: boxA, containment_ratio: (boxB.w * boxB.h) / (boxA.w * boxA.h) },
    });
  }

  // Overlap (only if not containment)
  const iou = computeIoU(boxA, boxB);
  if (iou > 0 && !isInside(boxA, boxB) && !isInside(boxB, boxA)) {
    relations.push({
      relation: "overlapping",
      confidence: iou,
      evidence: { subject_bbox: boxA, object_bbox: boxB, iou },
    });
  }

  // Near (within threshold distance of centers)
  const distance = Math.sqrt((cxA - cxB) ** 2 + (cyA - cyB) ** 2);
  const normalizedDistance = distance / Math.sqrt(imageRef.width ** 2 + imageRef.height ** 2);
  const nearThreshold = 0.15;

  if (normalizedDistance < nearThreshold && iou < 0.5) {
    relations.push({
      relation: "near",
      confidence: 1 - (normalizedDistance / nearThreshold),
      evidence: {
        subject_bbox: boxA,
        object_bbox: boxB,
        center_distance: Math.round(distance * 100) / 100,
        normalized_distance: Math.round(normalizedDistance * 1000) / 1000,
      },
      distance: Math.round(distance * 100) / 100,
    });
  }

  return relations;
}

/**
 * Compute temporal tracking relation between detections across frames.
 *
 * @param {Object[]} prevDetections - Detections from previous frame
 * @param {Object[]} currDetections - Detections from current frame
 * @param {number} [iouThreshold=0.3] - Minimum IoU to consider same object
 * @returns {Object[]} Tracking relation evidence objects
 */
export function computeTrackingRelations(prevDetections, currDetections, iouThreshold = 0.3) {
  if (!prevDetections || !currDetections) return [];

  const tracks = [];

  for (const curr of currDetections) {
    const currBox = curr.geometry?.bounding_box || curr.bounding_box;
    if (!currBox) continue;

    let bestMatch = null;
    let bestIoU = 0;

    for (const prev of prevDetections) {
      const prevBox = prev.geometry?.bounding_box || prev.bounding_box;
      if (!prevBox) continue;

      const iou = computeIoU(currBox, prevBox);
      if (iou > bestIoU && iou >= iouThreshold) {
        bestIoU = iou;
        bestMatch = prev;
      }
    }

    if (bestMatch) {
      const prevBox = bestMatch.geometry?.bounding_box || bestMatch.bounding_box;
      const velocity = {
        dx: Math.round(((currBox.x + currBox.w / 2) - (prevBox.x + prevBox.w / 2)) * 100) / 100,
        dy: Math.round(((currBox.y + currBox.h / 2) - (prevBox.y + prevBox.h / 2)) * 100) / 100,
      };

      tracks.push(buildEvidence({
        level: 4,
        type: "temporal_track",
        method: "iou-tracking",
        method_version: "1.0.0",
        parent_features: [bestMatch.feature_id, curr.feature_id],
        parent_hashes: [bestMatch.provenance?.feature_hash, curr.provenance?.feature_hash].filter(Boolean),
        confidence: bestIoU,
        extra: {
          subject: bestMatch.feature_id,
          relation: "same_object_as",
          object: curr.feature_id,
          track_id: `track_${bestMatch.feature_id}_${curr.feature_id}`,
          velocity,
          iou: bestIoU,
        },
      }));
    }
  }

  return tracks;
}

/**
 * Compute semantic groupings based on spatial proximity and class similarity.
 *
 * @param {Object[]} detections - L3 detections
 * @returns {Object[]} Grouping relation evidence
 */
export function computeSemanticGroups(detections) {
  if (!detections || detections.length < 2) return [];

  const groups = [];
  const used = new Set();

  for (let i = 0; i < detections.length; i++) {
    if (used.has(i)) continue;

    const group = [i];
    used.add(i);

    for (let j = i + 1; j < detections.length; j++) {
      if (used.has(j)) continue;

      const a = detections[i];
      const b = detections[j];

      // Group if same class and spatially close
      if (a.label === b.label) {
        const boxA = a.geometry?.bounding_box || a.bounding_box;
        const boxB = b.geometry?.bounding_box || b.bounding_box;

        if (boxA && boxB) {
          const cxA = boxA.x + boxA.w / 2;
          const cyA = boxA.y + boxA.h / 2;
          const cxB = boxB.x + boxB.w / 2;
          const cyB = boxB.y + boxB.h / 2;
          const dist = Math.sqrt((cxA - cxB) ** 2 + (cyA - cyB) ** 2);

          // Arbitrary proximity threshold: 20% of image diagonal
          if (dist < 0.2 * Math.sqrt(1920 ** 2 + 1080 ** 2)) {
            group.push(j);
            used.add(j);
          }
        }
      }
    }

    if (group.length >= 2) {
      const memberIds = group.map(idx => detections[idx].feature_id);
      const memberHashes = group.map(idx => detections[idx].provenance?.feature_hash).filter(Boolean);

      groups.push(buildEvidence({
        level: 4,
        type: "containment",
        method: "spatial-clustering",
        method_version: "1.0.0",
        parent_features: memberIds,
        parent_hashes: memberHashes,
        confidence: 0.8,
        extra: {
          subject: memberIds[0],
          relation: "grouped_with",
          object: memberIds.slice(1),
          group_size: group.length,
          group_class: detections[i].label,
          member_ids: memberIds,
        },
      }));
    }
  }

  return groups;
}

// ===== Utility Functions =====

function computeVerticalConfidence(boxA, boxB, imgHeight) {
  const gap = Math.abs((boxA.y + boxA.h) - boxB.y);
  const maxGap = imgHeight / 4;
  return Math.max(0.5, Math.min(0.99, 1 - gap / maxGap));
}

function computeHorizontalConfidence(boxA, boxB, imgWidth) {
  const gap = Math.abs((boxA.x + boxA.w) - boxB.x);
  const maxGap = imgWidth / 4;
  return Math.max(0.5, Math.min(0.99, 1 - gap / maxGap));
}

function isInside(inner, outer) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function computeIoU(a, b) {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  if (interX2 <= interX1 || interY2 <= interY1) return 0;

  const interArea = (interX2 - interX1) * (interY2 - interY1);
  const aArea = (ax2 - ax1) * (ay2 - ay1);
  const bArea = (bx2 - bx1) * (by2 - by1);

  return interArea / (aArea + bArea - interArea);
}
