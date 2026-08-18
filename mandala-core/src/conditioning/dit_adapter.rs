use crate::conditioning::{GBuffer, ConditioningClip};

/// DiT cross-attention conditioning adapter configuration.
/// Maps Mandala G-buffer channels → DiT key/value projections.
pub struct DiTAdapterConfig {
    /// DiT hidden size (d_model). Default: 4096.
    pub d_model: u32,
    /// DiT attention heads. Default: 32.
    pub num_heads: u32,
    /// Head dimension (d_model / num_heads). Default: 128.
    pub head_dim: u32,
    /// Conditioning channels from G-buffer. Default: 20.
    pub cond_channels: u32,
    /// Adapter hidden size (MLP projection). Default: 1024.
    pub adapter_hidden: u32,
    /// Patch size for spatial patchification. Default: 2.
    pub patch_size: u32,
}

impl Default for DiTAdapterConfig {
    fn default() -> Self {
        Self {
            d_model: 4096,
            num_heads: 32,
            head_dim: 128,
            cond_channels: 20,
            adapter_hidden: 1024,
            patch_size: 2,
        }
    }
}

/// Adapter weights (simplified — in production these are INT8 quantized).
pub struct DiTAdapterWeights {
    /// Patch embedding projection: [cond_channels, adapter_hidden]
    pub patch_embed_w: Vec<Vec<f32>>,
    pub patch_embed_b: Vec<f32>,
    /// Cross-attn K projection: [adapter_hidden, d_model]
    pub cross_attn_k_w: Vec<Vec<f32>>,
    pub cross_attn_k_b: Vec<f32>,
    /// Cross-attn V projection: [adapter_hidden, d_model]
    pub cross_attn_v_w: Vec<Vec<f32>>,
    pub cross_attn_v_b: Vec<f32>,
}

/// Result of conditioning adapter: keys and values for DiT cross-attention.
pub struct ConditioningKV {
    /// Keys: [num_patches, d_model]
    pub keys: Vec<Vec<f32>>,
    /// Values: [num_patches, d_model]
    pub values: Vec<Vec<f32>>,
    /// Number of patches (after spatial patchification).
    pub num_patches: u32,
}

/// Patchify a 2D conditioning plane into spatial patches.
/// Input: [H, W], patch_size P → output: [(H/P)*(W/P), P*P]
pub fn patchify_2d(plane: &[Vec<f32>], h: u32, w: u32, p: u32) -> Vec<Vec<f32>> {
    let mut patches = Vec::new();
    let ph = h / p;
    let pw = w / p;
    let patch_dim = (p * p) as usize;
    for py in 0..ph {
        for px in 0..pw {
            let mut patch = Vec::with_capacity(patch_dim);
            for dy in 0..p {
                for dx in 0..p {
                    let y = py * p + dy;
                    let x = px * p + dx;
                    if (y as usize) < plane.len() && (x as usize) < plane[y as usize].len() {
                        patch.push(plane[y as usize][x as usize]);
                    } else {
                        patch.push(0.0);
                    }
                }
            }
            patches.push(patch);
        }
    }
    patches
}

/// Patchify all conditioning channels and concatenate.
/// Input: packed buffer [C][H*W] → patches: [num_patches, C * P * P]
pub fn patchify_conditioning(
    packed: &[Vec<f32>],
    h: u32,
    w: u32,
    c: u32,
    p: u32,
) -> Vec<Vec<f32>> {
    let ph = h / p;
    let pw = w / p;
    let num_patches = (ph * pw) as usize;
    let patch_dim = (c * p * p) as usize;
    let mut result = vec![vec![0.0f32; patch_dim]; num_patches];

    for ch in 0..c as usize {
        let ch_buf = &packed[ch];
        let patches = patchify_2d(
            &(0..h).map(|y| {
                (0..w).map(|x| ch_buf[(y * w + x) as usize]).collect::<Vec<f32>>()
            }).collect::<Vec<Vec<f32>>>(),
            h, w, p,
        );
        for (i, patch) in patches.iter().enumerate() {
            let offset = ch * (p * p) as usize;
            for (j, &val) in patch.iter().enumerate() {
                result[i][offset + j] = val;
            }
        }
    }
    result
}

impl DiTAdapterWeights {
    /// Simple matrix multiply + bias: input[n, in_dim] @ weight[in_dim, out_dim] + bias[out_dim]
    fn linear_forward(input: &[Vec<f32>], weight: &[Vec<f32>], bias: &[f32]) -> Vec<Vec<f32>> {
        let n = input.len();
        let out_dim = bias.len();
        let in_dim = weight.len();
        let mut output = vec![vec![0.0f32; out_dim]; n];
        for i in 0..n {
            for j in 0..out_dim {
                let mut sum = bias[j];
                for k in 0..in_dim {
                    sum += input[i][k] * weight[k][j];
                }
                output[i][j] = sum;
            }
        }
        output
    }

    /// GELU activation (approximate).
    fn gelu(x: f32) -> f32 {
        0.5 * x * (1.0 + ((2.0_f32 / std::f32::consts::PI).sqrt() * (x + 0.044715 * x.powi(3))).tanh())
    }
}

/// Run the conditioning adapter: patchify → MLP → cross-attention K/V.
pub fn adapt_conditioning(
    gbuf: &GBuffer,
    weights: &DiTAdapterWeights,
    config: &DiTAdapterConfig,
) -> ConditioningKV {
    let packed = gbuf.pack();
    let c = gbuf.total_channels();
    let h = gbuf.height;
    let w = gbuf.width;
    let p = config.patch_size;

    // Patchify: [num_patches, C * P * P]
    let patches = patchify_conditioning(&packed, h, w, c, p);
    let num_patches = patches.len() as u32;

    // MLP adapter: patch_embed → GELU → cross_attn_k, cross_attn_v
    let hidden = DiTAdapterWeights::linear_forward(
        &patches, &weights.patch_embed_w, &weights.patch_embed_b,
    );
    let activated: Vec<Vec<f32>> = hidden.iter()
        .map(|row| row.iter().map(|&x| DiTAdapterWeights::gelu(x)).collect())
        .collect();

    let keys = DiTAdapterWeights::linear_forward(
        &activated, &weights.cross_attn_k_w, &weights.cross_attn_k_b,
    );
    let values = DiTAdapterWeights::linear_forward(
        &activated, &weights.cross_attn_v_w, &weights.cross_attn_v_b,
    );

    ConditioningKV { keys, values, num_patches }
}

/// Run adapter on a full conditioning clip (temporal).
pub fn adapt_conditioning_clip(
    clip: &ConditioningClip,
    weights: &DiTAdapterWeights,
    config: &DiTAdapterConfig,
) -> Vec<ConditioningKV> {
    clip.frames.iter()
        .map(|gbuf| adapt_conditioning(gbuf, weights, config))
        .collect()
}
