use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialParameter {
    pub default: MaterialValue,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub param_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MaterialValue {
    Float(f64),
    Vec3([f64; 3]),
    Vec2([f64; 2]),
    Int(i32),
    Bool(bool),
    Array(Vec<MaterialValue>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialEvidence {
    pub intent_id: String,
    pub world_id: String,
    pub timeline_id: String,
    pub parameters: Option<HashMap<String, MaterialValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialPreset {
    pub name: String,
    pub category: String,
    pub material_type: String,
    pub parameters: HashMap<String, MaterialParameter>,
    pub evidence: MaterialEvidence,
    pub constitutional: bool,
}

pub struct MaterialPresets {
    presets: HashMap<String, MaterialPreset>,
}

impl MaterialPresets {
    pub fn new() -> Self {
        let mut presets = HashMap::new();

        // Frosted Glass
        presets.insert("frosted_glass".to_string(), MaterialPreset {
            name: "Frosted Glass Microflake BRDF".to_string(),
            category: "procedural_materials".to_string(),
            material_type: "microflake".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("roughness".to_string(), MaterialParameter {
                    default: MaterialValue::Float(0.2),
                    min: Some(0.0),
                    max: Some(1.0),
                    param_type: "float".to_string(),
                });
                params.insert("ior".to_string(), MaterialParameter {
                    default: MaterialValue::Float(1.5),
                    min: Some(1.0),
                    max: Some(2.5),
                    param_type: "float".to_string(),
                });
                params.insert("flake_density".to_string(), MaterialParameter {
                    default: MaterialValue::Float(1000.0),
                    min: Some(100.0),
                    max: Some(10000.0),
                    param_type: "float".to_string(),
                });
                params
            },
            evidence: MaterialEvidence {
                intent_id: "mat-frosted-glass-v1".to_string(),
                world_id: "default".to_string(),
                timeline_id: "main".to_string(),
                parameters: None,
            },
            constitutional: true,
        });

        // Iridescent Thin Film
        presets.insert("iridescent_thin_film".to_string(), MaterialPreset {
            name: "Iridescent Thin-Film Interference".to_string(),
            category: "procedural_materials".to_string(),
            material_type: "thin_film".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("thickness".to_string(), MaterialParameter {
                    default: MaterialValue::Float(500.0),
                    min: Some(100.0),
                    max: Some(1000.0),
                    param_type: "float".to_string(),
                });
                params.insert("refractive_index".to_string(), MaterialParameter {
                    default: MaterialValue::Float(1.4),
                    min: Some(1.0),
                    max: Some(2.0),
                    param_type: "float".to_string(),
                });
                params
            },
            evidence: MaterialEvidence {
                intent_id: "mat-iridescent-v1".to_string(),
                world_id: "default".to_string(),
                timeline_id: "main".to_string(),
                parameters: None,
            },
            constitutional: true,
        });

        // Procedural Snow
        presets.insert("procedural_snow".to_string(), MaterialPreset {
            name: "Procedural Snow with SSS".to_string(),
            category: "procedural_materials".to_string(),
            material_type: "subsurface".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("albedo".to_string(), MaterialParameter {
                    default: MaterialValue::Vec3([0.95, 0.95, 0.98]),
                    min: None,
                    max: None,
                    param_type: "vec3".to_string(),
                });
                params.insert("sss_radius".to_string(), MaterialParameter {
                    default: MaterialValue::Float(0.5),
                    min: Some(0.0),
                    max: Some(2.0),
                    param_type: "float".to_string(),
                });
                params
            },
            evidence: MaterialEvidence {
                intent_id: "mat-snow-v1".to_string(),
                world_id: "default".to_string(),
                timeline_id: "main".to_string(),
                parameters: None,
            },
            constitutional: true,
        });

        // Disney BRDF
        presets.insert("disney_brdf".to_string(), MaterialPreset {
            name: "Disney BRDF Variant".to_string(),
            category: "lighting_brdf".to_string(),
            material_type: "disney".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("base_color".to_string(), MaterialParameter {
                    default: MaterialValue::Vec3([0.8, 0.2, 0.2]),
                    min: None,
                    max: None,
                    param_type: "vec3".to_string(),
                });
                params.insert("metallic".to_string(), MaterialParameter {
                    default: MaterialValue::Float(0.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    param_type: "float".to_string(),
                });
                params.insert("roughness".to_string(), MaterialParameter {
                    default: MaterialValue::Float(0.5),
                    min: Some(0.0),
                    max: Some(1.0),
                    param_type: "float".to_string(),
                });
                params.insert("clearcoat".to_string(), MaterialParameter {
                    default: MaterialValue::Float(0.0),
                    min: Some(0.0),
                    max: Some(1.0),
                    param_type: "float".to_string(),
                });
                params
            },
            evidence: MaterialEvidence {
                intent_id: "mat-disney-v1".to_string(),
                world_id: "default".to_string(),
                timeline_id: "main".to_string(),
                parameters: None,
            },
            constitutional: true,
        });

        // Toon Shader
        presets.insert("toon_shader".to_string(), MaterialPreset {
            name: "Toon Shader with Quantized Lighting".to_string(),
            category: "stylized_npr".to_string(),
            material_type: "toon".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("base_color".to_string(), MaterialParameter {
                    default: MaterialValue::Vec3([0.8, 0.3, 0.3]),
                    min: None,
                    max: None,
                    param_type: "vec3".to_string(),
                });
                params.insert("steps".to_string(), MaterialParameter {
                    default: MaterialValue::Int(4),
                    min: Some(2.0),
                    max: Some(8.0),
                    param_type: "int".to_string(),
                });
                params.insert("outline_width".to_string(), MaterialParameter {
                    default: MaterialValue::Float(0.02),
                    min: Some(0.0),
                    max: Some(0.1),
                    param_type: "float".to_string(),
                });
                params
            },
            evidence: MaterialEvidence {
                intent_id: "mat-toon-v1".to_string(),
                world_id: "default".to_string(),
                timeline_id: "main".to_string(),
                parameters: None,
            },
            constitutional: true,
        });

        Self { presets }
    }

    pub fn get(&self, name: &str) -> Option<&MaterialPreset> {
        self.presets.get(name)
    }

    pub fn list(&self) -> Vec<&str> {
        self.presets.keys().map(|s| s.as_str()).collect()
    }
}
