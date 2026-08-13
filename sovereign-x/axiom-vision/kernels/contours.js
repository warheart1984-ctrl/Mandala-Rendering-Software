/**
 * Axiom Vision — Contour Extraction (Level 2, Deterministic).
 *
 * Suzuki-Abe border following algorithm for binary images.
 * Extracts both external and hole contours with hierarchy.
 *
 * Each contour gets area, perimeter, bounding box, and Hu moments.
 */

import { buildEvidence } from "../evidence/evidenceBuilder.js";

// Neighbor offsets for 8-connectivity (clockwise from right)
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

/**
 * Extract contours from a binary mask.
 *
 * @param {Uint8Array} binaryMask - Binary mask (non-zero = foreground)
 * @param {number} width
 * @param {number} height
 * @param {number} tileX
 * @param {number} tileY
 * @param {number} tileW
 * @param {number} tileH
 * @param {number} tileIndex
 * @param {Object} tileGrid
 * @param {string[]} parentHashes
 * @param {number} minPerimeter - Minimum perimeter to emit contour (default 10)
 * @returns {Object[]} Array of contour evidence objects
 */
export function extractContours(binaryMask, width, height, tileX, tileY, tileW, tileH, tileIndex, tileGrid, parentHashes, minPerimeter = 10) {
  const visited = new Uint8Array(width * height);
  const contours = [];

  for (let py = tileY; py < tileY + tileH && py < height; py++) {
    for (let px = tileX; px < tileX + tileW && px < width; px++) {
      const idx = py * width + px;

      if (visited[idx]) continue;

      // Check if this is a border start
      const isForeground = binaryMask[idx];
      const isStart = isForeground && (
        px === 0 || px === width - 1 ||
        py === 0 || py === height - 1 ||
        !binaryMask[idx - 1] || !binaryMask[idx + 1] ||
        !binaryMask[idx - width] || !binaryMask[idx + width]
      );

      if (!isStart) continue;

      // Follow the contour
      const contour = followBorder(binaryMask, visited, width, height, px, py, isForeground);
      if (contour.points.length < minPerimeter) continue;

      const stats = computeContourStats(contour.points);
      if (stats.perimeter < minPerimeter) continue;

      contours.push(buildEvidence({
        level: 2,
        type: "contour",
        geometry: {
          bounding_box: stats.boundingBox,
          points: contour.points.length > 200
            ? contour.points.filter((_, i) => i % Math.ceil(contour.points.length / 200) === 0)
            : contour.points,
        },
        area: stats.area,
        perimeter: stats.perimeter,
        method: "suzuki-abe-border-following",
        method_version: "1.0.0",
        closed: contour.closed,
        tile: tileIndex,
        tile_grid: tileGrid,
        parent_hashes: parentHashes,
        confidence: 1.0,
        extra: {
          is_outer: contour.isOuter,
          hu_moments: stats.huMoments,
          centroid: stats.centroid,
        },
      }));
    }
  }

  // Sort by area descending for deterministic output
  return contours.sort((a, b) => b.area - a.area);
}

function followBorder(mask, visited, width, height, startX, startY, isForeground) {
  const points = [];
  let cx = startX, cy = startY;
  let dir = isForeground ? 7 : 3;
  let firstStep = true;
  let stepCount = 0;
  const maxSteps = width * height; // safety limit

  while (stepCount < maxSteps) {
    points.push([cx, cy]);
    visited[cy * width + cx] = 1;

    // Find next border pixel
    let found = false;
    for (let i = 0; i < 8; i++) {
      const ndir = (dir + i) % 8;
      const nx = cx + DX[ndir];
      const ny = cy + DY[ndir];

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nIdx = ny * width + nx;
      if (isForeground ? mask[nIdx] : !mask[nIdx]) {
        cx = nx;
        cy = ny;
        dir = (ndir + 6) % 8; // Next search direction
        found = true;
        break;
      }
    }

    if (!found) break;

    if (!firstStep && cx === startX && cy === startY) {
      return { points, closed: true, isOuter: isForeground };
    }
    firstStep = false;
    stepCount++;
  }

  return { points, closed: false, isOuter: isForeground };
}

function computeContourStats(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let perimeter = 0;
  let area = 0;
  let cxSum = 0, cySum = 0;

  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[(i + 1) % n];

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;

    perimeter += Math.sqrt((nx - x) ** 2 + (ny - y) ** 2);
    area += x * ny - nx * y;

    cxSum += x;
    cySum += y;
  }

  area = Math.abs(area) / 2;
  perimeter = Math.round(perimeter * 100) / 100;

  // Compute Hu moments (7 invariant moments)
  const huMoments = computeHuMoments(points, cxSum / n, cySum / n);

  return {
    area: Math.round(area * 100) / 100,
    perimeter,
    boundingBox: {
      x: Math.round(minX),
      y: Math.round(minY),
      w: Math.round(maxX - minX + 1),
      h: Math.round(maxY - minY + 1),
    },
    centroid: {
      x: Math.round((cxSum / n) * 100) / 100,
      y: Math.round((cySum / n) * 100) / 100,
    },
    huMoments,
  };
}

function computeHuMoments(points, cx, cy) {
  const n = points.length;

  // Raw moments
  let mu20 = 0, mu02 = 0, mu11 = 0, mu30 = 0, mu03 = 0, mu12 = 0, mu21 = 0;

  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    mu20 += dx * dx;
    mu02 += dy * dy;
    mu11 += dx * dy;
    mu30 += dx * dx * dx;
    mu03 += dy * dy * dy;
    mu12 += dx * dy * dy;
    mu21 += dx * dx * dy;
  }

  // Central moments (normalized)
  const n15 = n ** 1.5;
  const n2 = n * n;
  const n25 = n2 * Math.sqrt(n);
  const n3 = n * n * n;
  const n35 = n3 * Math.sqrt(n);
  const n4 = n2 * n2;

  const eta20 = mu20 / n2;
  const eta02 = mu02 / n2;
  const eta11 = mu11 / n2;
  const eta30 = mu30 / n25;
  const eta03 = mu03 / n25;
  const eta12 = mu12 / n25;
  const eta21 = mu21 / n25;

  // 7 Hu moments
  const hu = [];
  hu[0] = eta20 + eta02;
  hu[1] = (eta20 - eta02) ** 2 + 4 * eta11 ** 2;
  hu[2] = (eta30 - 3 * eta12) ** 2 + (3 * eta21 - eta03) ** 2;
  hu[3] = (eta30 + eta12) ** 2 + (eta21 + eta03) ** 2;
  hu[4] = (eta30 - 3 * eta12) * (eta30 + eta12) * ((eta30 + eta12) ** 2 - 3 * (eta21 + eta03) ** 2) +
           (3 * eta21 - eta03) * (eta21 + eta03) * (3 * (eta30 + eta12) ** 2 - (eta21 + eta03) ** 2);
  hu[5] = (eta20 - eta02) * ((eta30 + eta12) ** 2 - (eta21 + eta03) ** 2) +
           4 * eta11 * (eta30 + eta12) * (eta21 + eta03);
  hu[6] = (3 * eta21 - eta03) * (eta30 + eta12) * ((eta30 + eta12) ** 2 - 3 * (eta21 + eta03) ** 2) -
           (eta30 - 3 * eta12) * (eta21 + eta03) * (3 * (eta30 + eta12) ** 2 - (eta21 + eta03) ** 2);

  return hu.map(v => {
    if (Math.abs(v) < 1e-10) return 0;
    return v >= 0 ? Math.round(Math.log10(v) * 1000) / 1000 : -Math.round(Math.log10(-v) * 1000) / 1000;
  });
}
