pub mod hip_backend;

pub enum RenderBackendKind {
    Vulkan,
    HipComputeAssistOnly,
}

pub struct RenderBackendSelection {
    pub kind: RenderBackendKind,
    pub arch_name: &'static str,
    pub vendor: &'static str,
}

pub fn select_render_backend() -> RenderBackendSelection {
    RenderBackendSelection { kind: RenderBackendKind::Vulkan, arch_name: "unknown", vendor: "unknown" }
}
