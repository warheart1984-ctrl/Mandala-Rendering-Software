/// Shader Variants Library
/// Constitutional: all shaders are deterministic and auditable

use std::f64::consts::PI;

#[derive(Debug, Clone)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub fn add(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    pub fn sub(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }

    pub fn scale(&self, s: f64) -> Vec3 {
        Vec3 {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }

    pub fn mul(&self, other: &Vec3) -> Vec3 {
        Vec3 {
            x: self.x * other.x,
            y: self.y * other.y,
            z: self.z * other.z,
        }
    }

    pub fn dot(&self, other: &Vec3) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn normalize(&self) -> Vec3 {
        let len = self.dot(self).sqrt();
        if len < 1e-10 {
            Vec3::new(0.0, 0.0, 0.0)
        } else {
            self.scale(1.0 / len)
        }
    }

    pub fn lerp(a: &Vec3, b: &Vec3, t: f64) -> Vec3 {
        Vec3 {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            z: a.z + (b.z - a.z) * t,
        }
    }
}

const RECIP_PI: f64 = 1.0 / PI;

/// Disney BRDF Implementation
pub struct DisneyBRDF {
    pub base_color: Vec3,
    pub metallic: f64,
    pub roughness: f64,
    pub subsurface: f64,
    pub specular: f64,
    pub specular_tint: f64,
    pub anisotropic: f64,
    pub sheen: f64,
    pub sheen_tint: f64,
    pub clearcoat: f64,
    pub clearcoat_gloss: f64,
}

impl DisneyBRDF {
    pub fn new(base_color: Vec3, metallic: f64, roughness: f64) -> Self {
        Self {
            base_color,
            metallic,
            roughness,
            subsurface: 0.0,
            specular: 0.5,
            specular_tint: 0.0,
            anisotropic: 0.0,
            sheen: 0.0,
            sheen_tint: 0.0,
            clearcoat: 0.0,
            clearcoat_gloss: 0.0,
        }
    }

    pub fn evaluate(&self, wo: &Vec3, wi: &Vec3, normal: &Vec3) -> Vec3 {
        let n = normal;
        let v = wo;
        let l = wi;
        let h = v.add(l).normalize();

        let ndotv = n.dot(v).max(0.001);
        let ndotl = n.dot(l).max(0.0);
        let ndoth = n.dot(&h).max(0.0);
        let vdoth = v.dot(&h).max(0.0);

        if ndotl <= 0.0 {
            return Vec3::new(0.0, 0.0, 0.0);
        }

        // Diffuse
        let diffuse = self.diffuse_term(ndotv, ndotl, vdoth, self.roughness);

        // Specular (GGX)
        let specular = self.specular_term(ndoth, ndotv, ndotl, vdoth, self.roughness);

        // Sheen
        let sheen = self.sheen_term(ndotv, ndotl, vdoth, self.sheen_tint);

        // Clearcoat
        let clearcoat = self.clearcoat_term(ndoth, self.clearcoat_gloss);

        // Combine
        let diffuse_color = self.base_color.scale(1.0 - self.metallic);
        let specular_color = Vec3::lerp(&Vec3::new(0.04, 0.04, 0.04), &self.base_color, self.metallic);

        let mut result = diffuse_color.mul(&diffuse.scale((1.0 - self.metallic)));
        result = result.add(&specular_color.mul(&specular.scale(self.specular)));
        result = result.add(&sheen.scale(self.sheen));
        result = result.add(&clearcoat.scale(self.clearcoat));

        result.scale(ndotl)
    }

    fn diffuse_term(&self, ndotv: f64, ndotl: f64, vdoth: f64, roughness: f64) -> Vec3 {
        let fd90 = 0.5 + 2.0 * roughness * vdoth * vdoth;
        let light_scatter = 1.0 + (fd90 - 1.0) * (1.0 - ndotl).powi(5);
        let view_scatter = 1.0 + (fd90 - 1.0) * (1.0 - ndotv).powi(5);
        Vec3::new(1.0, 1.0, 1.0).scale(RECIP_PI * light_scatter * view_scatter)
    }

    fn specular_term(&self, ndoth: f64, ndotv: f64, ndotl: f64, vdoth: f64, roughness: f64) -> Vec3 {
        let a = roughness * roughness;
        let a2 = a * a;
        let d = ndoth * ndoth * (a2 - 1.0) + 1.0;
        let d_val = a2 / (PI * d * d);

        let f = (1.0 - vdoth).powi(5);

        let k = (roughness + 1.0);
        let k2 = k * k / 8.0;
        let g1v = ndotv / (ndotv * (1.0 - k2) + k2);
        let g1l = ndotl / (ndotl * (1.0 - k2) + k2);
        let g = g1v * g1l;

        Vec3::new(1.0, 1.0, 1.0).scale(d_val * f * g)
    }

    fn sheen_term(&self, ndotv: f64, ndotl: f64, vdoth: f64, sheen_tint: f64) -> Vec3 {
        let fh = (1.0 - vdoth).powi(5);
        let fdh = 1.0 + fh * (sheen_tint - 1.0);
        let factor = (1.0 - ndotv).powi(5) * (1.0 - ndotl).powi(5);
        Vec3::new(1.0, 1.0, 1.0).scale(fdh * factor)
    }

    fn clearcoat_term(&self, ndoth: f64, gloss: f64) -> Vec3 {
        let a = 0.1 * (1.0 - gloss) + 0.001;
        let a2 = a * a;
        let d = ndoth * ndoth * (a2 - 1.0) + 1.0;
        let d_val = a2 / (PI * d * d);
        let f = 0.04 + 0.96 * (1.0 - ndoth).powi(5);
        Vec3::new(1.0, 1.0, 1.0).scale(d_val * f * 0.25)
    }
}

/// Multi-Lobe GGX BRDF
pub struct MultiLobeGGX {
    pub base_color: Vec3,
    pub metallic: f64,
    pub lobes: Vec<GGXLobe>,
}

pub struct GGXLobe {
    pub roughness: f64,
    pub weight: f64,
    pub f0: f64,
}

impl MultiLobeGGX {
    pub fn new(base_color: Vec3, metallic: f64) -> Self {
        let lobes = vec![
            GGXLobe { roughness: 0.2, weight: 0.7, f0: 0.04 },
            GGXLobe { roughness: 0.6, weight: 0.3, f0: 0.04 },
        ];
        Self {
            base_color,
            metallic,
            lobes,
        }
    }

    pub fn evaluate(&self, wo: &Vec3, wi: &Vec3, normal: &Vec3) -> Vec3 {
        let n = normal;
        let v = wo;
        let l = wi;
        let h = v.add(l).normalize();

        let ndotv = n.dot(v).max(0.001);
        let ndotl = n.dot(l).max(0.0);
        let ndoth = n.dot(&h).max(0.0);
        let vdoth = v.dot(&h).max(0.0);

        if ndotl <= 0.0 {
            return Vec3::new(0.0, 0.0, 0.0);
        }

        // Diffuse (Lambert)
        let diffuse = self.base_color.scale(RECIP_PI * (1.0 - self.metallic));

        // Sum multi-lobe specular
        let mut specular = Vec3::new(0.0, 0.0, 0.0);
        for lobe in &self.lobes {
            let d = self.ggx_ndf(ndoth, lobe.roughness);
            let g = self.ggx_geometry(ndotv, ndotl, lobe.roughness);
            let f = self.schlick_fresnel(vdoth, lobe.f0);
            specular = specular.add(&Vec3::new(1.0, 1.0, 1.0).scale(d * g * f * lobe.weight));
        }

        // Metallic reflection
        let specular_color = Vec3::lerp(&Vec3::new(0.04, 0.04, 0.04), &self.base_color, self.metallic);
        specular = specular_color.mul(&specular);

        let result = diffuse.mul(&self.base_color).add(&specular);
        result.scale(ndotl)
    }

    fn ggx_ndf(&self, ndoth: f64, roughness: f64) -> f64 {
        let a = roughness * roughness;
        let a2 = a * a;
        let d = ndoth * ndoth * (a2 - 1.0) + 1.0;
        a2 / (PI * d * d)
    }

    fn ggx_geometry(&self, ndotv: f64, ndotl: f64, roughness: f64) -> f64 {
        let k = (roughness + 1.0);
        let k2 = k * k / 8.0;
        let g1v = ndotv / (ndotv * (1.0 - k2) + k2);
        let g1l = ndotl / (ndotl * (1.0 - k2) + k2);
        g1v * g1l
    }

    fn schlick_fresnel(&self, cos_theta: f64, f0: f64) -> f64 {
        f0 + (1.0 - f0) * (1.0 - cos_theta).powi(5)
    }
}

/// Clearcoat Layer BRDF
pub struct ClearcoatBRDF {
    pub base_color: Vec3,
    pub base_roughness: f64,
    pub clearcoat_roughness: f64,
    pub clearcoat_ior: f64,
    pub clearcoat_weight: f64,
}

impl ClearcoatBRDF {
    pub fn new(base_color: Vec3, base_roughness: f64, clearcoat_roughness: f64) -> Self {
        Self {
            base_color,
            base_roughness,
            clearcoat_roughness,
            clearcoat_ior: 1.5,
            clearcoat_weight: 0.5,
        }
    }

    pub fn evaluate(&self, wo: &Vec3, wi: &Vec3, normal: &Vec3) -> Vec3 {
        let n = normal;
        let v = wo;
        let l = wi;
        let h = v.add(l).normalize();

        let ndotv = n.dot(v).max(0.001);
        let ndotl = n.dot(l).max(0.0);
        let ndoth = n.dot(&h).max(0.0);
        let vdoth = v.dot(&h).max(0.0);

        if ndotl <= 0.0 {
            return Vec3::new(0.0, 0.0, 0.0);
        }

        // Base layer (GGX)
        let base_d = self.ggx_ndf(ndoth, self.base_roughness);
        let base_g = self.ggx_geometry(ndotv, ndotl, self.base_roughness);
        let base_f = self.schlick_fresnel(vdoth, 0.04);
        let base_specular = Vec3::new(1.0, 1.0, 1.0).scale(base_d * base_g * base_f);
        let base_diffuse = self.base_color.scale(RECIP_PI);

        // Clearcoat layer
        let clearcoat_d = self.ggx_ndf(ndoth, self.clearcoat_roughness);
        let clearcoat_g = self.ggx_geometry(ndotv, ndotl, self.clearcoat_roughness);
        let clearcoat_f0 = ((self.clearcoat_ior - 1.0) / (self.clearcoat_ior + 1.0)).powi(2);
        let clearcoat_f = self.schlick_fresnel(vdoth, clearcoat_f0);
        let clearcoat = clearcoat_d * clearcoat_g * clearcoat_f * 0.25;

        // Combine
        let base_color = base_diffuse.add(&self.base_color.scale(base_specular.x * (1.0 - self.metallic)));
        let result = Vec3::lerp(&base_color, &Vec3::new(1.0, 1.0, 1.0), clearcoat * self.clearcoat_weight);

        result.scale(ndotl)
    }

    fn ggx_ndf(&self, ndoth: f64, roughness: f64) -> f64 {
        let a = roughness * roughness;
        let a2 = a * a;
        let d = ndoth * ndoth * (a2 - 1.0) + 1.0;
        a2 / (PI * d * d)
    }

    fn ggx_geometry(&self, ndotv: f64, ndotl: f64, roughness: f64) -> f64 {
        let k = (roughness + 1.0);
        let k2 = k * k / 8.0;
        let g1v = ndotv / (ndotv * (1.0 - k2) + k2);
        let g1l = ndotl / (ndotl * (1.0 - k2) + k2);
        g1v * g1l
    }

    fn schlick_fresnel(&self, cos_theta: f64, f0: f64) -> f64 {
        f0 + (1.0 - f0) * (1.0 - cos_theta).powi(5)
    }
}

/// Subsurface Scattering Dipole Approximation
pub struct SubsurfaceScattering {
    pub albedo: Vec3,
    pub mean_free_path: Vec3,
    pub ior: f64,
    pub scatter_distance: f64,
}

impl SubsurfaceScattering {
    pub fn new(albedo: Vec3, scatter_distance: f64) -> Self {
        Self {
            albedo,
            mean_free_path: Vec3::new(1.0, 0.4, 0.2),
            ior: 1.4,
            scatter_distance,
        }
    }

    pub fn evaluate(&self, wo: &Vec3, wi: &Vec3, normal: &Vec3) -> Vec3 {
        let n = normal;
        let v = wo;
        let l = wi;

        let ndotv = n.dot(v).max(0.001);
        let ndotl = n.dot(l).max(0.0);

        if ndotl <= 0.0 {
            return Vec3::new(0.0, 0.0, 0.0);
        }

        // Diffuse component
        let diffuse = Vec3::new(1.0, 1.0, 1.0).scale(RECIP_PI * ndotl);

        // SSS approximation
        let vdoth = v.dot(&l.add(v).normalize()).max(0.0);
        let fd90 = 0.5 + 2.0 * self.scatter_distance * vdoth * vdoth;
        let light_scatter = 1.0 + (fd90 - 1.0) * (1.0 - ndotl).powi(5);
        let view_scatter = 1.0 + (fd90 - 1.0) * (1.0 - ndotv).powi(5);
        let sss = Vec3::new(1.0, 1.0, 1.0).scale(RECIP_PI * light_scatter * view_scatter);

        // Combine
        self.albedo.mul(&diffuse.add(&sss).scale(0.5))
    }
}
