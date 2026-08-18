pub mod engine;
pub mod backend;
pub mod isa;

pub mod eml {
    pub use crate::isa::eml::*;
}

pub use engine::Engine;
pub use backend::GpuBackend;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    NvidiaPtx,
    VulkanSpirv,
}

pub struct Buffer {
    pub handle: u64,
    pub size: usize,
}

#[derive(Debug, Clone, Copy)]
pub enum KernelArg<'a> {
    Buffer(&'a Buffer),
    Scalar(Scalar),
}

#[derive(Debug, Clone, Copy)]
pub enum Scalar {
    U32(u32),
    F32(f32),
}

pub enum BackendHandle {
    Cuda {
        module: u64,
        func: u64,
    },
    Vulkan {
        pipeline: u64,
        layout: u64,
    },
}

pub struct CompiledKernel {
    pub target: Target,
    pub handle: BackendHandle,
}

pub trait GpuBackend {
    fn target(&self) -> Target;
    fn alloc(&self, bytes: usize) -> Buffer;
    fn upload(&self, buf: &Buffer, data: &[u8]);
    fn download(&self, buf: &Buffer, out: &mut [u8]);
    fn launch(&self, kernel: &CompiledKernel, grid: [u32; 3], block: [u32; 3], args: &[KernelArg]);
}
