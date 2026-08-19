# Bradley Bridge

Integration layer for Bradley's multithreaded RT4D renderer.

## Architecture

```
mandala-core/src/bradley_bridge/
├── mod.rs              # Node.js FFI wrapper
├── rayon_renderer.rs   # Rust rayon-based parallel renderer
└── constitutional.rs   # Constitutional verification bridge
```

## Components

### 1. Node.js FFI (`BradleyBridge`)
Calls Bradley's renderer via child process:
- `render_still()` - Multithreaded still rendering
- `render_animation()` - Frame-parallel animation with denoise
- `denoise_image()` - OIDN denoiser integration

### 2. Rayon Renderer (`RayonRenderer`)
Rust port of Bradley's threading logic:
- `rayon::par_chunks()` for row-parallel rendering
- Deterministic per-row RNG seeding
- Byte-identical replay across thread counts

### 3. Constitutional Bridge (`ConstitutionalBridge`)
Combines both approaches:
- Runs both renderers
- Verifies SHA256 match
- Proves constitutional replay

## Usage

```rust
use mandala_core::bradley_bridge::{ConstitutionalBridge, BradleyRendererConfig};

let bridge = ConstitutionalBridge::new("E:\\Mandala-Bradley");

let config = BradleyRendererConfig {
    prompt: "cyan tesseract lattice".to_string(),
    width: 1280,
    height: 720,
    samples: 8,
    max_depth: 5,
    threads: 16,
    seed: Some(42),
    output: "output.png".into(),
    provenance: Some("output.json".into()),
};

let result = bridge.render_still(&config)?;
println!("Bradley: {:.1}ms", result.bradley.elapsed_ms);
println!("Rayon: {:.1}ms", result.rayon.elapsed_ms);
println!("Constitutional: {}", result.sha256_match);
```

## Testing

```bash
python tests/constitutional_replay_test.py
```

## Performance

Measured on Ryzen 7 8700G (16 threads) + RTX 5060 Ti:

| Version | Time (720p/8spp) | Speedup |
|---------|------------------|---------|
| Single thread | 327.7s | 1× |
| 16 cores (Node.js) | 48.1s | 6.8× |
| 16 cores (Rayon) | ~45s | ~7.3× |
| 2spp + CUDA denoise | ~12s | 27× |

## Constitutional Guarantees

- Byte-identical output across thread counts
- Deterministic replay with same seed
- SHA256 verification between implementations
- RT4D pre-validation compatible
