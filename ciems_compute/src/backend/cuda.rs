use crate::{GpuBackend, Target, Buffer, KernelArg, CompiledKernel};

pub struct CudaBackend {
    pub ctx: u64,
}

impl CudaBackend {
    pub fn new(device_ordinal: i32) -> Self {
        Self { ctx: device_ordinal as u64 }
    }

    pub fn load_ptx(_ptx: &str, _entry: &str) -> (u64, u64) {
        (0, 0)
    }
}

impl GpuBackend for CudaBackend {
    fn target(&self) -> Target { Target::NvidiaPtx }
    fn alloc(&self, bytes: usize) -> Buffer { Buffer { handle: 0, size: bytes } }
    fn upload(&self, _buf: &Buffer, _data: &[u8]) {}
    fn download(&self, _buf: &Buffer, _out: &mut [u8]) {}
    fn launch(&self, _kernel: &CompiledKernel, _grid: [u32; 3], _block: [u32; 3], _args: &[KernelArg]) {}
}
