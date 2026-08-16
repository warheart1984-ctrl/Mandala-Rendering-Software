use crate::backend::{select_render_backend, RenderBackendKind};
use crate::rendergraph::{RenderPassMetrics, TemporalCache, FrameState};

#[cfg(feature = "hip")]
use crate::backend::hip_backend::HipBackend;

pub struct MandalaEngine {
    backend_kind: RenderBackendKind,
    temporal_cache: TemporalCache,
    #[cfg(feature = "hip")]
    hip_backend: Option<HipBackend>,
    #[cfg(not(feature = "hip"))]
    hip_backend: Option<()>,
}

impl MandalaEngine {
    pub fn new() -> Self {
        let sel = select_render_backend();
        Self {
            backend_kind: sel.kind,
            temporal_cache: TemporalCache::new(3),
            #[cfg(feature = "hip")]
            hip_backend: None,
            #[cfg(not(feature = "hip"))]
            hip_backend: None,
        }
    }

    pub fn render_frame(&mut self) {
        let passes = vec![
            RenderPassMetrics { latency_est: 0.0, throughput_est: 0.0, thermal_est: 0.0, usage_est: 0.0, priority: 0.0 },
        ];

        let reuse = self.temporal_cache.can_reuse(&passes[0], 0.01);
        if reuse {
            // reuse previous assist bundle
            return;
        }

        // schedule passes...
        let state = FrameState {
            metrics: passes[0].clone(),
            motion_magnitude: 0.0,
            replay_token: 0,
        };
        self.temporal_cache.push(state);
    }
}
