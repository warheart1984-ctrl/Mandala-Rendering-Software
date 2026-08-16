use crate::rendergraph::metrics::RenderPassMetrics;

#[derive(Clone)]
pub struct FrameState {
    pub metrics: RenderPassMetrics,
    pub motion_magnitude: f32,
    pub replay_token: u64,
}

pub struct TemporalCache {
    pub(crate) history: Vec<FrameState>,
    max_len: usize,
}

impl TemporalCache {
    pub fn new(max_len: usize) -> Self {
        Self { history: Vec::new(), max_len }
    }

    pub fn push(&mut self, state: FrameState) {
        if self.history.len() >= self.max_len {
            self.history.remove(0);
        }
        self.history.push(state);
    }

    pub fn can_reuse(&self, current: &RenderPassMetrics, threshold: f32) -> bool {
        if let Some(last) = self.history.last() {
            let delta = (current.latency_est - last.metrics.latency_est).abs()
                + (current.throughput_est - last.metrics.throughput_est).abs()
                + (current.thermal_est - last.metrics.thermal_est).abs();
            return delta < threshold && last.motion_magnitude < threshold;
        }
        false
    }

    pub fn last_token(&self) -> Option<u64> {
        self.history.last().map(|s| s.replay_token)
    }
}
