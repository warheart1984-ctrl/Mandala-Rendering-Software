/**
 * Axiom Native - Test Script
 */

const { AxiomContext, AXIOM_FMT_RGBA8 } = require('./build/Release/axiom_native');

async function test() {
    console.log('Testing Axiom Native bindings...');
    
    // Create context
    const ctx = new AxiomContext('cpu.native');
    console.log('Context created');
    
    // Get caps
    const caps = ctx.getCaps();
    console.log('Capabilities:', caps);
    
    // Create scene
    const scene = ctx.createScene({
        width: 256,
        height: 256,
        samples: 4,
        maxDepth: 3,
        seed: 3322933546,
        promptHash: 3322933546,
        cameraPosition: { x: 0, y: 0, z: -5, w: 0 },
        cameraLookAt: { x: 0, y: 0, z: 0, w: 0 },
        fovX: 52,
        fovY: 52,
        fovW: 8
    });
    console.log('Scene created');
    
    // Get scene hash
    const hash = scene.getHash();
    console.log('Scene hash:', hash);
    
    // Allocate buffer
    const buffer = ctx.allocBuffer(256, 256, AXIOM_FMT_RGBA8);
    console.log('Buffer allocated:', buffer.length, 'bytes');
    
    // Render a tile
    const tile = {
        x: 0,
        y: 0,
        width: 64,
        height: 64,
        tileIndex: 0
    };
    
    await scene.renderTile(tile, buffer, 3322933546);
    console.log('Tile rendered');
    
    // Verify buffer has data
    let nonZero = 0;
    for (let i = 0; i < Math.min(100, buffer.length); i++) {
        if (buffer[i] !== 0) nonZero++;
    }
    console.log('Non-zero pixels in sample:', nonZero);
    
    // Cleanup
    scene.destroy();
    ctx.destroy();
    console.log('Test completed successfully!');
}

test().catch(console.error);