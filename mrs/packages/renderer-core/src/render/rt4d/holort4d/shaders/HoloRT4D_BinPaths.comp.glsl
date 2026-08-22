// HoloRT4D_BinPaths.comp
// Status: declared. CPU models the same integer map + atomic count in aligned.js.
// Camera-aligned: no world-to-plane reprojection.

layout(std430, binding = 0) buffer PathBuffer { PathSample paths[]; };
layout(std430, binding = 1) buffer TileHeaders { TileBinHeader headers[]; };
layout(std430, binding = 2) buffer TileEntries { TileBinEntry entries[]; };

void main() {
    uint idx = gl_GlobalInvocationID.x;
    PathSample p = paths[idx];
    uint px = p.pixelId % frameWidth;
    uint py = p.pixelId / frameWidth;
    uint holoX = px * holoResX / frameWidth;
    uint holoY = py * holoResY / frameHeight;
    uint tileX = holoX / TILE_SIZE_X;
    uint tileY = holoY / TILE_SIZE_Y;
    uint tileId = tileY * numTilesX + tileX;
    uint writeIndex = atomicAdd(headers[tileId].count, 1);
    entries[headers[tileId].offset + writeIndex].pathIndex = idx;
}
