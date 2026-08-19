pub mod dit_adapter;
pub mod exporter;

/// Conditioning tensor shape: [T, C, H, W]
/// T = temporal frames, C = channels, H = height, W = width
pub type Tensor4D = Vec<Vec<Vec<Vec<f32>>>>; // [T][C][H][W]

/// G-buffer: all conditioning channels produced by Mandala world sim
/// for a single frame.
pub struct GBuffer {
    pub width: u32,
    pub height: u32,
    pub depth: DepthMap,
    pub normals: NormalMap,
    pub motion: MotionVectorBuffer,
    pub materials: MaterialHints,
    pub lighting: LightingHints,
    pub objects: ObjectMaskBuffer,
}

/// Per-pixel depth (single channel).
pub struct DepthMap {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<f32>, // [H * W], values in [0, 1]
}

/// Per-pixel surface normals (3 channels: X, Y, Z).
pub struct NormalMap {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<[f32; 3]>, // [H * W], each normal in [-1, 1]
}

/// Per-pixel motion vectors (2 channels: dX, dY).
pub struct MotionVectorBuffer {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<[f32; 2]>, // [H * W], subpixel displacement
}

/// Per-pixel material hints (4 channels: roughness, metalness, specular, subsurface).
pub struct MaterialHints {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<[f32; 4]>, // [H * W]
}

/// Per-pixel lighting hints (2 channels: intensity, direction_encoded).
pub struct LightingHints {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<[f32; 2]>, // [H * W]
}

/// Per-pixel object mask (K channels, one-hot or soft).
pub struct ObjectMaskBuffer {
    pub width: u32,
    pub height: u32,
    pub num_classes: u32, // K (e.g. 8)
    pub pixels: Vec<Vec<f32>>, // [H * W][K]
}

impl GBuffer {
    pub fn new(width: u32, height: u32) -> Self {
        let n = (width * height) as usize;
        Self {
            width,
            height,
            depth: DepthMap { width, height, pixels: vec![0.0; n] },
            normals: NormalMap { width, height, pixels: vec![[0.0; 3]; n] },
            motion: MotionVectorBuffer { width, height, pixels: vec![[0.0; 2]; n] },
            materials: MaterialHints { width, height, pixels: vec![[0.5; 4]; n] },
            lighting: LightingHints { width, height, pixels: vec![[1.0, 0.0]; n] },
            objects: ObjectMaskBuffer { width, height, num_classes: 8, pixels: vec![vec![0.0; 8]; n] },
        }
    }

    /// Total conditioning channels: depth(1) + normals(3) + motion(2) + materials(4) + lighting(2) + objects(8) = 20
    pub fn total_channels(&self) -> u32 {
        1 + 3 + 2 + 4 + 2 + self.objects.num_classes
    }

    /// Pack all channels into a single flat buffer [C][H * W].
    pub fn pack(&self) -> Vec<Vec<f32>> {
        let n = (self.width * self.height) as usize;
        let c = self.total_channels() as usize;
        let mut buf = vec![vec![0.0f32; n]; c];
        let mut ch = 0;

        // Depth: 1 channel
        for i in 0..n { buf[ch][i] = self.depth.pixels[i]; }
        ch += 1;

        // Normals: 3 channels
        for i in 0..n {
            buf[ch][i] = self.normals.pixels[i][0];
            buf[ch + 1][i] = self.normals.pixels[i][1];
            buf[ch + 2][i] = self.normals.pixels[i][2];
        }
        ch += 3;

        // Motion: 2 channels
        for i in 0..n {
            buf[ch][i] = self.motion.pixels[i][0];
            buf[ch + 1][i] = self.motion.pixels[i][1];
        }
        ch += 2;

        // Materials: 4 channels
        for i in 0..n {
            for j in 0..4 { buf[ch + j][i] = self.materials.pixels[i][j]; }
        }
        ch += 4;

        // Lighting: 2 channels
        for i in 0..n {
            buf[ch][i] = self.lighting.pixels[i][0];
            buf[ch + 1][i] = self.lighting.pixels[i][1];
        }
        ch += 2;

        // Object masks: K channels
        for i in 0..n {
            for j in 0..self.objects.num_classes as usize {
                buf[ch + j][i] = self.objects.pixels[i][j];
            }
        }

        buf
    }

    /// Convert to 4D tensor [T=1, C, H, W] for DiT conditioning.
    pub fn to_tensor(&self) -> Tensor4D {
        let packed = self.pack();
        let c = packed.len();
        let h = self.height as usize;
        let w = self.width as usize;
        let mut tensor = Vec::with_capacity(1);
        let mut frame = Vec::with_capacity(c);
        for ch_buf in &packed {
            let mut plane = Vec::with_capacity(h);
            for y in 0..h {
                let mut row = Vec::with_capacity(w);
                for x in 0..w {
                    row.push(ch_buf[y * w + x]);
                }
                plane.push(row);
            }
            frame.push(plane);
        }
        tensor.push(frame);
        tensor
    }
}

/// Sequence of G-buffers for a video clip (T frames).
pub struct ConditioningClip {
    pub frames: Vec<GBuffer>,
    pub temporal_dim: u32, // T
}

impl ConditioningClip {
    pub fn new(temporal_dim: u32) -> Self {
        Self { frames: Vec::new(), temporal_dim }
    }

    pub fn push_frame(&mut self, gbuf: GBuffer) {
        self.frames.push(gbuf);
    }

    /// Pack to 4D tensor [T, C, H, W].
    pub fn to_tensor(&self) -> Tensor4D {
        if self.frames.is_empty() { return vec![]; }
        let c = self.frames[0].total_channels() as usize;
        let h = self.frames[0].height as usize;
        let w = self.frames[0].width as usize;
        let t = self.frames.len();
        let mut tensor = Vec::with_capacity(t);
        for gbuf in &self.frames {
            let packed = gbuf.pack();
            let mut frame = Vec::with_capacity(c);
            for ch_buf in &packed {
                let mut plane = Vec::with_capacity(h);
                for y in 0..h {
                    let mut row = Vec::with_capacity(w);
                    for x in 0..w {
                        row.push(ch_buf[y * w + x]);
                    }
                    plane.push(row);
                }
                frame.push(plane);
            }
            tensor.push(frame);
        }
        tensor
    }
}
