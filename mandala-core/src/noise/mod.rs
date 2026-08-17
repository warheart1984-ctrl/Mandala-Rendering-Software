/// Procedural Noise Functions
/// Constitutional: deterministic, replayable, auditable

const PERLIN_PERM: [u8; 512] = [
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
    250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
    189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
    172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
    228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
    107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
    151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
    8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
    35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
    134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
    55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
    18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
    250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
    189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
    172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
    228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
    107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
    138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
];

const PERLIN_GRAD3: [[f64; 3]; 12] = [
    [1.0, 1.0, 0.0], [-1.0, 1.0, 0.0], [1.0, -1.0, 0.0], [-1.0, -1.0, 0.0],
    [1.0, 0.0, 1.0], [-1.0, 0.0, 1.0], [1.0, 0.0, -1.0], [-1.0, 0.0, -1.0],
    [0.0, 1.0, 1.0], [0.0, -1.0, 1.0], [0.0, 1.0, -1.0], [0.0, -1.0, -1.0],
];

fn fade(t: f64) -> f64 {
    t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

fn lerp(t: f64, a: f64, b: f64) -> f64 {
    a + t * (b - a)
}

fn dot3(g: [f64; 3], x: f64, y: f64, z: f64) -> f64 {
    g[0] * x + g[1] * y + g[2] * z
}

pub fn perlin3d(x: f64, y: f64, z: f64) -> f64 {
    let xi = x.floor() as i32 & 255;
    let yi = y.floor() as i32 & 255;
    let zi = z.floor() as i32 & 255;

    let xf = x - x.floor();
    let yf = y - y.floor();
    let zf = z - z.floor();

    let u = fade(xf);
    let v = fade(yf);
    let w = fade(zf);

    let a = (PERLIN_PERM[xi as usize] as i32 + yi) & 255;
    let aa = (PERLIN_PERM[a as usize] as i32 + zi) & 255;
    let ab = (PERLIN_PERM[(a + 1) as usize] as i32 + zi) & 255;
    let b = (PERLIN_PERM[(xi + 1) as usize] as i32 + yi) & 255;
    let ba = (PERLIN_PERM[b as usize] as i32 + zi) & 255;
    let bb = (PERLIN_PERM[(b + 1) as usize] as i32 + zi) & 255;

    lerp(w,
        lerp(v,
            lerp(u,
                dot3(PERLIN_GRAD3[PERLIN_PERM[aa as usize] as usize % 12], xf, yf, zf),
                dot3(PERLIN_GRAD3[PERLIN_PERM[ba as usize] as usize % 12], xf - 1.0, yf, zf)
            ),
            lerp(u,
                dot3(PERLIN_GRAD3[PERLIN_PERM[ab as usize] as usize % 12], xf, yf - 1.0, zf),
                dot3(PERLIN_GRAD3[PERLIN_PERM[bb as usize] as usize % 12], xf - 1.0, yf - 1.0, zf)
            )
        ),
        lerp(v,
            lerp(u,
                dot3(PERLIN_GRAD3[PERLIN_PERM[(aa + 1) as usize] as usize % 12], xf, yf, zf - 1.0),
                dot3(PERLIN_GRAD3[PERLIN_PERM[(ba + 1) as usize] as usize % 12], xf - 1.0, yf, zf - 1.0)
            ),
            lerp(u,
                dot3(PERLIN_GRAD3[PERLIN_PERM[(ab + 1) as usize] as usize % 12], xf, yf - 1.0, zf - 1.0),
                dot3(PERLIN_GRAD3[PERLIN_PERM[(bb + 1) as usize] as usize % 12], xf - 1.0, yf - 1.0, zf - 1.0)
            )
        )
    )
}

pub fn perlin2d(x: f64, y: f64) -> f64 {
    perlin3d(x, y, 0.0)
}

pub fn fbm(x: f64, y: f64, z: f64, octaves: u32, lacunarity: f64, gain: f64) -> f64 {
    let mut sum = 0.0;
    let mut amp = 1.0;
    let mut freq = 1.0;
    let mut max_amp = 0.0;

    for _ in 0..octaves {
        sum += perlin3d(x * freq, y * freq, z * freq) * amp;
        max_amp += amp;
        amp *= gain;
        freq *= lacunarity;
    }

    sum / max_amp
}

pub fn marble(x: f64, y: f64, z: f64, scale: f64, turbulence: f64) -> f64 {
    let nx = x * scale + fbm(x, y, z, 4, 2.0, 0.5) * turbulence;
    let ny = y * scale + fbm(x + 5.2, y + 1.3, z, 4, 2.0, 0.5) * turbulence;
    (nx + ny).sin() * 0.5 + 0.5
}

pub fn wood(x: f64, y: f64, z: f64, scale: f64, ring_scale: f64) -> f64 {
    let nx = x * scale;
    let ny = y * scale;
    let nz = z * scale;

    let dist = (nx * nx + ny * ny).sqrt();
    (dist * ring_scale + fbm(x, y, z, 3, 2.0, 0.5) * 2.0).sin() * 0.5 + 0.5
}

pub fn granite(x: f64, y: f64, z: f64, scale: f64, detail: u32) -> f64 {
    let mut sum = 0.0;
    let mut amp = 1.0;
    let mut freq = 1.0;

    for i in 0..detail {
        let seed = i * 100;
        let n = worley3d(x * freq * scale, y * freq * scale, z * freq * scale, seed);
        sum += n * amp;
        amp *= 0.5;
        freq *= 2.0;
    }

    sum
}

fn hash2d(x: i32, y: i32, seed: u32) -> u32 {
    let mut h = seed;
    h ^= (x as u32).wrapping_mul(374761393);
    h ^= (y as u32).wrapping_mul(668265263);
    h = h ^ (h >> 13);
    h = h.wrapping_mul(1274126177);
    h ^ (h >> 16)
}

fn hash2d_float(x: i32, y: i32, seed: u32) -> f64 {
    (hash2d(x, y, seed) & 0x7fffffff) as f64 / 0x7fffffff as f64
}

pub fn worley2d(x: f64, y: f64, seed: u32) -> f64 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let fx = x - x.floor();
    let fy = y - y.floor();

    let mut min_dist = f64::INFINITY;

    for dy in -1..=1 {
        for dx in -1..=1 {
            let cx = ix + dx;
            let cy = iy + dy;

            let px = cx as f64 + hash2d_float(cx, cy, seed);
            let py = cy as f64 + hash2d_float(cx, cy, seed + 1);

            let dist = ((fx - dx as f64 - hash2d_float(cx, cy, seed)).powi(2) +
                       (fy - dy as f64 - hash2d_float(cx, cy, seed + 1)).powi(2)).sqrt();
            min_dist = min_dist.min(dist);
        }
    }

    min_dist
}

pub fn worley3d(x: f64, y: f64, z: f64, seed: u32) -> f64 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let iz = z.floor() as i32;
    let fx = x - x.floor();
    let fy = y - y.floor();
    let fz = z - z.floor();

    let mut min_dist = f64::INFINITY;

    for dz in -1..=1 {
        for dy in -1..=1 {
            for dx in -1..=1 {
                let cx = ix + dx;
                let cy = iy + dy;
                let cz = iz + dz;

                let dist = ((fx - dx as f64 - hash2d_float(cx, cy, seed)).powi(2) +
                           (fy - dy as f64 - hash2d_float(cx, cy, seed + 1)).powi(2) +
                           (fz - dz as f64 - hash2d_float(cx, cy, seed + 2)).powi(2)).sqrt();
                min_dist = min_dist.min(dist);
            }
        }
    }

    min_dist
}

pub fn cloud(x: f64, y: f64, z: f64, scale: f64, detail_scale: f64) -> f64 {
    let base = fbm(x * scale, y * scale, z * scale, 6, 2.0, 0.5);
    let detail = fbm(x * detail_scale, y * detail_scale, z * detail_scale, 4, 2.0, 0.5);
    (base + detail * 0.3) * 0.5 + 0.5
}
