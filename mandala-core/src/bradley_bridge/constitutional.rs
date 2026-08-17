use crate::bradley_bridge::{BradleyBridge, BradleyRendererConfig, BradleyRenderResult};
use crate::bradley_bridge::rayon_renderer::{RayonRenderer, RenderConfig, RenderResult};
use std::path::PathBuf;

pub struct ConstitutionalBridge {
    bradley_bridge: BradleyBridge,
    rayon_renderer: Option<RayonRenderer>,
}

impl ConstitutionalBridge {
    pub fn new(bradley_repo_path: &str) -> Self {
        let bradley_bridge = BradleyBridge::new(bradley_repo_path);

        Self {
            bradley_bridge,
            rayon_renderer: None,
        }
    }

    pub fn render_still(&mut self, config: &BradleyRendererConfig) -> Result<ConstitutionalRenderResult, String> {
        let t0 = std::time::Instant::now();

        let bradley_result = self.bradley_bridge.render_still(config)?;

        let rayon_config = RenderConfig {
            width: config.width,
            height: config.height,
            samples: config.samples,
            max_depth: config.max_depth,
            seed: config.seed.unwrap_or(42),
        };

        let rayon_renderer = RayonRenderer::new(rayon_config);
        let rayon_result = rayon_renderer.render();

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

        Ok(ConstitutionalRenderResult {
            bradley: bradley_result.clone(),
            rayon: rayon_result.clone(),
            sha256_match: bradley_result.sha256 == rayon_result.sha256,
            constitutional: true,
            total_elapsed_ms: elapsed_ms,
        })
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
    ) -> Result<ConstitutionalAnimationResult, String> {
        let t0 = std::time::Instant::now();

        let result = self.bradley_bridge.render_animation(
            prompt,
            frames,
            fps,
            width,
            height,
            samples,
            output_dir,
            denoise,
            oidn_path,
            denoise_device,
        )?;

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

        Ok(ConstitutionalAnimationResult {
            animation: result,
            constitutional: true,
            total_elapsed_ms: elapsed_ms,
        })
    }

    pub fn denoise_image(
        &self,
        input_path: &str,
        output_path: &str,
        device: &str,
        oidn_path: Option<&str>,
    ) -> Result<ConstitutionalDenoiseResult, String> {
        let t0 = std::time::Instant::now();

        let result = self.bradley_bridge.denoise_image(
            input_path,
            output_path,
            device,
            oidn_path,
        )?;

        let elapsed_ms = t0.elapsed().as_secs_f64() * 1000.0;

        Ok(ConstitutionalDenoiseResult {
            denoise: result,
            constitutional: true,
            total_elapsed_ms: elapsed_ms,
        })
    }

    pub fn verify_replay(&self, result1: &BradleyRenderResult, result2: &BradleyRenderResult) -> bool {
        result1.sha256 == result2.sha256
    }
}

#[derive(Debug, Clone)]
pub struct ConstitutionalRenderResult {
    pub bradley: BradleyRenderResult,
    pub rayon: RenderResult,
    pub sha256_match: bool,
    pub constitutional: bool,
    pub total_elapsed_ms: f64,
}

#[derive(Debug, Clone)]
pub struct ConstitutionalAnimationResult {
    pub animation: crate::bradley_bridge::AnimationResult,
    pub constitutional: bool,
    pub total_elapsed_ms: f64,
}

#[derive(Debug, Clone)]
pub struct ConstitutionalDenoiseResult {
    pub denoise: crate::bradley_bridge::DenoiseResult,
    pub constitutional: bool,
    pub total_elapsed_ms: f64,
}
