use crate::{GpuBackend, Target, Buffer, KernelArg, CompiledKernel};

pub struct VulkanBackend {
    pub device: u64,
}

impl VulkanBackend {
    pub fn new() -> Self { Self { device: 0 } }
    pub fn create_pipeline(_spirv: &[u32]) -> (u64, u64) { (0, 0) }
}

impl GpuBackend for VulkanBackend {
    fn target(&self) -> Target { Target::VulkanSpirv }
    fn alloc(&self, bytes: usize) -> Buffer { Buffer { handle: 0, size: bytes } }
    fn upload(&self, _buf: &Buffer, _data: &[u8]) {}
    fn download(&self, _buf: &Buffer, _out: &mut [u8]) {}
    fn launch(&self, _kernel: &CompiledKernel, _grid: [u32; 3], _block: [u32; 3], _args: &[KernelArg]) {}
}
