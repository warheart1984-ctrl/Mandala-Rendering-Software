// Debug_TileInspector.comp
// Status: GPU declared. CPU inspectTile is partial (tested).
// coherence = |sum(E)| / sum(|E|); encode 0 when sumMag==0.

layout(local_size_x = 1, local_size_y = 1) in;
layout(std140, binding = 0) uniform DebugUBO {
    uint holoResX;
    uint holoResY;
    uint tileSizeX;
    uint tileSizeY;
    uint numTilesX;
    uint numTilesY;
};
layout(std430, binding = 1) buffer HoloField {
    ComplexFieldPixel field[];
};
layout(std430, binding = 3) buffer TileSummaryBuffer {
    TileSummary summaries[];
};
void main() {
    uint tileId = gl_GlobalInvocationID.x;
    uint tileX = tileId % numTilesX;
    uint tileY = tileId / numTilesX;
    uint startX = tileX * tileSizeX;
    uint startY = tileY * tileSizeY;
    float sumReal = 0.0;
    float sumImag = 0.0;
    float sumMag  = 0.0;
    for (uint y = 0; y < tileSizeY; ++y) {
        for (uint x = 0; x < tileSizeX; ++x) {
            uint px = startX + x;
            uint py = startY + y;
            uint idx = py * holoResX + px;
            float real = field[idx].real;
            float imag = field[idx].imag;
            float mag  = length(vec2(real, imag));
            sumReal += real;
            sumImag += imag;
            sumMag  += mag;
        }
    }
    float energy = sumMag;
    float avgPhase = atan(sumImag, sumReal);
    float coherence = length(vec2(sumReal, sumImag)) / sumMag;
    summaries[tileId] = TileSummary(energy, avgPhase, coherence);
}
