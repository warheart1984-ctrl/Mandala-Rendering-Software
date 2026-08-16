use crate::rendergraph::metrics::RenderPassMetrics;

#[derive(Debug, Clone)]
pub struct ConstitutionalTrace {
    pub frame_id: u64,
    pub backend: String,
    pub metrics: RenderPassMetrics,
    pub replay_token: u64,
    pub assist_bundle_hash: [u8; 32],
}

pub struct TraceExporter {
    traces: Vec<ConstitutionalTrace>,
}

impl TraceExporter {
    pub fn new() -> Self {
        Self { traces: Vec::new() }
    }

    pub fn export(&mut self, frame_id: u64, backend: &str, metrics: RenderPassMetrics, replay_token: u64) {
        self.traces.push(ConstitutionalTrace {
            frame_id,
            backend: backend.to_string(),
            metrics,
            replay_token,
            assist_bundle_hash: [0u8; 32],
        });
    }

    pub fn dump(&self) -> String {
        format!("{:#?}", self.traces)
    }
}
