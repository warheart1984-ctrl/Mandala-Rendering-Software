use crate::conditioning::{GBuffer, ConditioningClip, Tensor4D};
use std::fs;
use std::path::Path;

/// Serialize a single G-buffer to JSON for Python training pipeline.
pub fn export_gbuffer_json(gbuf: &GBuffer, path: &Path) -> std::io::Result<()> {
    let packed = gbuf.pack();
    let tensor = gbuf.to_tensor();
    let data = serde_json::json!({
        "width": gbuf.width,
        "height": gbuf.height,
        "total_channels": gbuf.total_channels(),
        "tensor_shape": [1, gbuf.total_channels(), gbuf.height, gbuf.width],
        "channels": {
            "depth": { "range": [0.0, 1.0], "description": "per-pixel depth" },
            "normals": { "range": [-1.0, 1.0], "channels": 3, "description": "surface normal XYZ" },
            "motion": { "channels": 2, "description": "subpixel motion vectors dX dY" },
            "materials": { "channels": 4, "description": "roughness metalness specular subsurface" },
            "lighting": { "channels": 2, "description": "intensity direction_encoded" },
            "objects": { "channels": gbuf.objects.num_classes, "description": "one-hot object masks" }
        },
        "tensor": tensor,
        "constitutional": {
            "gpu_assist_only": true,
            "replayable": true,
            "source": "mandala-world-sim"
        }
    });
    fs::write(path, serde_json::to_string_pretty(&data).unwrap())
}

/// Serialize a conditioning clip (temporal sequence) to JSON.
pub fn export_clip_json(clip: &ConditioningClip, path: &Path) -> std::io::Result<()> {
    let tensor = clip.to_tensor();
    let data = serde_json::json!({
        "temporal_dim": clip.temporal_dim,
        "num_frames": clip.frames.len(),
        "width": clip.frames.first().map(|f| f.width).unwrap_or(0),
        "height": clip.frames.first().map(|f| f.height).unwrap_or(0),
        "total_channels": clip.frames.first().map(|f| f.total_channels()).unwrap_or(0),
        "tensor_shape": [
            clip.frames.len(),
            clip.frames.first().map(|f| f.total_channels()).unwrap_or(0),
            clip.frames.first().map(|f| f.height).unwrap_or(0),
            clip.frames.first().map(|f| f.width).unwrap_or(0),
        ],
        "tensor": tensor,
        "constitutional": {
            "gpu_assist_only": true,
            "replayable": true,
            "source": "mandala-world-sim"
        }
    });
    fs::write(path, serde_json::to_string_pretty(&data).unwrap())
}

/// Export packed conditioning tensor as raw binary (f32 little-endian) for fast Python loading.
/// Layout: [T, C, H, W] contiguous.
pub fn export_tensor_binary(tensor: &Tensor4D, path: &Path) -> std::io::Result<()> {
    let mut buf = Vec::new();
    for frame in tensor {
        for plane in frame {
            for row in plane {
                for &val in row {
                    buf.extend_from_slice(&val.to_le_bytes());
                }
            }
        }
    }
    fs::write(path, buf)
}

/// Export a raw binary .npy-compatible header + data for direct numpy.load().
pub fn export_numpy(tensor: &Tensor4D, path: &Path) -> std::io::Result<()> {
    let t = tensor.len();
    let c = tensor.first().map(|f| f.len()).unwrap_or(0);
    let h = tensor.first().and_then(|f| f.first()).map(|p| p.len()).unwrap_or(0);
    let w = tensor.first().and_then(|f| f.first()).and_then(|p| p.first()).map(|r| r.len()).unwrap_or(0);

    let header = format!(
        "{{'descr': '<f4', 'fortran_order': False, 'shape': ({}, {}, {}, {})}}\n",
        t, c, h, w
    );
    let padded_header = format!("{:<128}", header);
    let magic = b"\x93NUMPY\x01\x00";
    let header_bytes = padded_header.as_bytes();

    let mut buf = Vec::new();
    buf.extend_from_slice(magic);
    buf.extend_from_slice(&(header_bytes.len() as u16).to_le_bytes());
    buf.extend_from_slice(header_bytes);

    for frame in tensor {
        for plane in frame {
            for row in plane {
                for &val in row {
                    buf.extend_from_slice(&val.to_le_bytes());
                }
            }
        }
    }

    fs::write(path, buf)
}
