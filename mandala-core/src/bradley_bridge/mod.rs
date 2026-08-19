mod rayon_renderer;
mod constitutional;

pub use rayon_renderer::{RayonRenderer, RenderConfig, RenderResult};
pub use constitutional::{ConstitutionalBridge, ConstitutionalRenderResult, ConstitutionalAnimationResult, ConstitutionalDenoiseResult};

use std::process::Command;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BradleyRendererConfig {
    pub prompt: String,
    pub width: u32,
    pub height: u32,
    pub samples: u32,
    pub max_depth: u32,
    pub threads: u32,
    pub seed: Option<u32>,
    pub output: PathBuf,
    pub provenance: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BradleyRenderResult {
    pub engine: String,
    pub renderer_version: String,
    pub kind: String,
    pub prompt: String,
    pub prompt_hash: u32,
    pub seed: u32,
    pub scene: String,
    pub palette: String,
    pub width: u32,
    pub height: u32,
    pub samples: u32,
    pub max_depth: u32,
    pub threads: u32,
    pub elapsed_ms: f64,
    pub bytes: usize,
    pub sha256: String,
    pub mean_luminance: f64,
    pub mean_luminance_center: f64,
    pub dark_pixel_fraction: f64,
}

pub struct BradleyBridge {
    node_path: PathBuf,
    renderer_core_path: PathBuf,
}

impl BradleyBridge {
    pub fn new(bradley_repo_path: &str) -> Self {
        let node_path = PathBuf::from("node");
        let renderer_core_path = PathBuf::from(bradley_repo_path)
            .join("mrs")
            .join("packages")
            .join("renderer-core");

        Self {
            node_path,
            renderer_core_path,
        }
    }

    pub fn render_still(&self, config: &BradleyRendererConfig) -> Result<BradleyRenderResult, String> {
        let script_path = self.renderer_core_path.join("scripts").join("render-still-mt.mjs");

        let mut args = vec![
            script_path.to_str().unwrap().to_string(),
            "--prompt".to_string(),
            config.prompt.clone(),
            "--width".to_string(),
            config.width.to_string(),
            "--height".to_string(),
            config.height.to_string(),
            "--samples".to_string(),
            config.samples.to_string(),
            "--max-depth".to_string(),
            config.max_depth.to_string(),
            "--threads".to_string(),
            config.threads.to_string(),
            "--output".to_string(),
            config.output.to_str().unwrap().to_string(),
        ];

        if let Some(seed) = config.seed {
            args.push("--seed".to_string());
            args.push(seed.to_string());
        }

        if let Some(provenance) = &config.provenance {
            args.push("--provenance".to_string());
            args.push(provenance.to_str().unwrap().to_string());
        }

        let output = Command::new(&self.node_path)
            .args(&args)
            .current_dir(&self.renderer_core_path)
            .output()
            .map_err(|e| format!("Failed to execute node: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Renderer failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: BradleyRenderResult = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse result: {}", e))?;

        Ok(result)
    }

    pub fn render_animation(
        &self,
        prompt: &str,
        frames: u32,
        fps: u32,
        width: u32,
        height: u32,
        samples: u32,
        output_dir: &str,
        denoise: bool,
        oidn_path: Option<&str>,
        denoise_device: Option<&str>,
    ) -> Result<AnimationResult, String> {
        let script_path = self.renderer_core_path.join("scripts").join("render-animation-mt.mjs");

        let mut args = vec![
            script_path.to_str().unwrap().to_string(),
            "--prompt".to_string(),
            prompt.to_string(),
            "--frames".to_string(),
            frames.to_string(),
            "--fps".to_string(),
            fps.to_string(),
            "--width".to_string(),
            width.to_string(),
            "--height".to_string(),
            height.to_string(),
            "--samples".to_string(),
            samples.to_string(),
            "--output-dir".to_string(),
            output_dir.to_string(),
        ];

        if denoise {
            args.push("--denoise".to_string());
            if let Some(oidn) = oidn_path {
                args.push("--oidn".to_string());
                args.push(oidn.to_string());
            }
            if let Some(device) = denoise_device {
                args.push("--denoise-device".to_string());
                args.push(device.to_string());
            }
        }

        let output = Command::new(&self.node_path)
            .args(&args)
            .current_dir(&self.renderer_core_path)
            .output()
            .map_err(|e| format!("Failed to execute node: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Animation renderer failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: AnimationResult = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse animation result: {}", e))?;

        Ok(result)
    }

    pub fn denoise_image(
        &self,
        input_path: &str,
        output_path: &str,
        device: &str,
        oidn_path: Option<&str>,
    ) -> Result<DenoiseResult, String> {
        let script_path = self.renderer_core_path.join("scripts").join("denoise-png.mjs");

        let mut args = vec![
            script_path.to_str().unwrap().to_string(),
            "--input".to_string(),
            input_path.to_string(),
            "--output".to_string(),
            output_path.to_string(),
            "--device".to_string(),
            device.to_string(),
        ];

        if let Some(oidn) = oidn_path {
            args.push("--oidn".to_string());
            args.push(oidn.to_string());
        }

        let output = Command::new(&self.node_path)
            .args(&args)
            .current_dir(&self.renderer_core_path)
            .output()
            .map_err(|e| format!("Failed to execute node: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Denoiser failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let result: DenoiseResult = serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse denoise result: {}", e))?;

        Ok(result)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationResult {
    pub frames: u32,
    pub elapsed_s: f64,
    pub render_fps: f64,
    pub threads: u32,
    pub output_dir: String,
    pub video: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenoiseResult {
    pub input: String,
    pub output: String,
    pub width: u32,
    pub height: u32,
    pub device: String,
    pub denoise_ms: f64,
}
