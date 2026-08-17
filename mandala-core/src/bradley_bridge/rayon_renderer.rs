use rayon::prelude::*;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderConfig {
    pub width: u32,
    pub height: u32,
    pub samples: u32,
    pub max_depth: u32,
    pub seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderResult {
    pub width: u32,
    pub height: u32,
    pub samples: u32,
    pub elapsed_ms: f64,
    pub sha256: String,
    pub mean_luminance: f64,
}

pub struct RayonRenderer {
    config: RenderConfig,
}

impl RayonRenderer {
    pub fn new(config: RenderConfig) -> Self {
        Self { config }
    }

    pub fn render(&self) -> RenderResult {
        let t0 = Instant::now();

        let pixels = Arc::new(Mutex::new(vec![0u8; (self.config.width * self.config.height * 4) as usize]));

        let row_bands: Vec<u32> = (0..self.config.height).collect();

        row_bands.par_chunks(rayon::current_num_threads().max(1)).for_each(|chunk| {
            for &y in chunk {
                self.render_row(y, &pixels);
            }
        });

        let pixels = Arc::try_unwrap(pixels).unwrap().into_inner().unwrap();

        let sha256 = self.compute_sha256(&pixels);
        let mean_luminance = self.compute_mean_luminance(&pixels);

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

        RenderResult {
            width: self.config.width,
            height: self.config.height,
            samples: self.config.samples,
            elapsed_ms,
            sha256,
            mean_luminance,
        }
    }

    fn render_row(&self, y: u32, pixels: &Arc<Mutex<Vec<u8>>>) {
        let mut rng = self.create_rng(self.config.seed ^ y);

        for x in 0..self.config.width {
            let mut r = 0.0f64;
            let mut g = 0.0f64;
            let mut b = 0.0f64;

            for _ in 0..self.config.samples {
                let (sr, sg, sb) = self.trace_pixel(x, y, &mut rng);
                r += sr;
                g += sg;
                b += sb;
            }

            let scale = 1.0 / self.config.samples as f64;
            r = (r * scale).min(1.0).max(0.0);
            g = (g * scale).min(1.0).max(0.0);
            b = (b * scale).min(1.0).max(0.0);

            let idx = ((y * self.config.width + x) * 4) as usize;
            let mut pixels = pixels.lock().unwrap();
            pixels[idx] = (r * 255.0) as u8;
            pixels[idx + 1] = (g * 255.0) as u8;
            pixels[idx + 2] = (b * 255.0) as u8;
            pixels[idx + 3] = 255;
        }
    }

    fn trace_pixel(&self, x: u32, y: u32, rng: &mut Rng) -> (f64, f64, f64) {
        let nx = (x as f64 + rng.next()) / self.config.width as f64;
        let ny = (y as f64 + rng.next()) / self.config.height as f64;

        let mut r = 0.0;
        let mut g = 0.0;
        let mut b = 0.0;

        for _ in 0..self.config.samples {
            let (sr, sg, sb) = self.path_trace(nx, ny, rng);
            r += sr;
            g += sg;
            b += sb;
        }

        let scale = 1.0 / self.config.samples as f64;
        (r * scale, g * scale, b * scale)
    }

    fn path_trace(&self, nx: f64, ny: f64, rng: &mut Rng) -> (f64, f64, f64) {
        let mut r = 0.0;
        let mut g = 0.0;
        let mut b = 0.0;

        let mut depth = 0;
        let mut depth_limit = self.config.max_depth;

        while depth < depth_limit {
            let hit = self.intersect_scene(nx, ny, rng);

            if let Some(hit) = hit {
                let (sr, sg, sb) = self.shade(&hit, rng);
                r += sr;
                g += sg;
                b += sb;

                if rng.next() < 0.5 {
                    depth_limit -= 1;
                } else {
                    break;
                }
            } else {
                let (sr, sg, sb) = self.sky_color(nx, ny);
                r += sr;
                g += sg;
                b += sb;
                break;
            }

            depth += 1;
        }

        (r, g, b)
    }

    fn intersect_scene(&self, nx: f64, ny: f64, rng: &mut Rng) -> Option<Hit> {
        let sphere_center = (0.0, 0.0, -3.0);
        let sphere_radius = 1.0;

        let origin = (0.0, 0.0, 0.0);
        let direction = (nx * 2.0 - 1.0, ny * 2.0 - 1.0, -1.0);

        let oc = (
            origin.0 - sphere_center.0,
            origin.1 - sphere_center.1,
            origin.2 - sphere_center.2,
        );

        let a = direction.0 * direction.0 + direction.1 * direction.1 + direction.2 * direction.2;
        let b = 2.0 * (oc.0 * direction.0 + oc.1 * direction.1 + oc.2 * direction.2);
        let c = oc.0 * oc.0 + oc.1 * oc.1 + oc.2 * oc.2 - sphere_radius * sphere_radius;

        let discriminant = b * b - 4.0 * a * c;

        if discriminant < 0.0 {
            return None;
        }

        let t = (-b - discriminant.sqrt()) / (2.0 * a);

        if t < 0.0 {
            return None;
        }

        let point = (
            origin.0 + t * direction.0,
            origin.1 + t * direction.1,
            origin.2 + t * direction.2,
        );

        let normal = (
            (point.0 - sphere_center.0) / sphere_radius,
            (point.1 - sphere_center.1) / sphere_radius,
            (point.2 - sphere_center.2) / sphere_radius,
        );

        Some(Hit {
            point,
            normal,
            t,
        })
    }

    fn shade(&self, hit: &Hit, rng: &mut Rng) -> (f64, f64, f64) {
        let light_dir = (1.0, 1.0, -1.0);
        let light_len = (light_dir.0 * light_dir.0 + light_dir.1 * light_dir.1 + light_dir.2 * light_dir.2).sqrt();
        let light_dir = (light_dir.0 / light_len, light_dir.1 / light_len, light_dir.2 / light_len);

        let diffuse = hit.normal.0 * light_dir.0 + hit.normal.1 * light_dir.1 + hit.normal.2 * light_dir.2;
        let diffuse = diffuse.max(0.0);

        let r = 0.8 * diffuse;
        let g = 0.2 * diffuse;
        let b = 0.8 * diffuse;

        (r, g, b)
    }

    fn sky_color(&self, nx: f64, ny: f64) -> (f64, f64, f64) {
        let r = 0.5 * (1.0 - ny);
        let g = 0.7 * (1.0 - ny);
        let b = 1.0;
        (r, g, b)
    }

    fn create_rng(&self, seed: u32) -> Rng {
        Rng { state: seed }
    }

    fn compute_sha256(&self, pixels: &[u8]) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        pixels.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    fn compute_mean_luminance(&self, pixels: &[u8]) -> f64 {
        let mut sum = 0.0;
        let mut count = 0;

        for chunk in pixels.chunks_exact(4) {
            let r = chunk[0] as f64 / 255.0;
            let g = chunk[1] as f64 / 255.0;
            let b = chunk[2] as f64 / 255.0;
            let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            sum += luminance;
            count += 1;
        }

        sum / count as f64
    }
}

struct Hit {
    point: (f64, f64, f64),
    normal: (f64, f64, f64),
    t: f64,
}

struct Rng {
    state: u32,
}

impl Rng {
    fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = self.state;
        t = t.wrapping_mul(t ^ (t >> 15));
        t = t.wrapping_add(t ^ (t >> 7));
        t = t.wrapping_mul(t ^ (t >> 11));
        (t as f64) / (u32::MAX as f64)
    }
}
