/**
 * Tile renderer skeleton for declared 4K/8K workloads.
 * Status: **skeleton** — currently delegates to full-frame soft-raster.
 * Spec: ENGINE3D_CINEMATIC_FOUNDATION_v1.0.md PR-2 (SHOULD, not MUST).
 */

import type { HeadlessGLStillRenderer } from "./raster/HeadlessStillRenderer.js";
import type { RasterStillFiles } from "./raster/HeadlessStillRenderer.js";

export interface TileConfig {
  tileWidth: number;
  tileHeight: number;
}

export class TileRenderer3D {
  constructor(
    private baseRenderer: HeadlessGLStillRenderer,
    private tileCfg: TileConfig,
  ) {
    if (tileCfg.tileWidth < 1 || tileCfg.tileHeight < 1) {
      throw new Error("tile size must be ≥ 1");
    }
  }

  /**
   * Declared tile path. Soft-raster MVP writes the full frame once.
   * True viewport tiling is not enforced yet.
   */
  renderTiled(outDir: string, prefix = ""): RasterStillFiles {
    void this.tileCfg;
    return this.baseRenderer.renderToDir(outDir, prefix);
  }
}
