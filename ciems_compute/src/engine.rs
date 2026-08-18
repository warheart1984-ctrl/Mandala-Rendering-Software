use crate::{GpuBackend, CompiledKernel, KernelArg, Buffer, Scalar};

pub struct Engine<B: GpuBackend> {
    pub backend: B,
}

impl<B: GpuBackend> Engine<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    pub fn alloc_f32(&self, count: usize) -> Buffer {
        self.backend.alloc(count * 4)
    }

    pub fn upload_f32(&self, buf: &Buffer, data: &[f32]) {
        let bytes = bytemuck::cast_slice(data);
        self.backend.upload(buf, bytes);
    }

    pub fn download_f32(&self, buf: &Buffer, out: &mut [f32]) {
        let bytes = bytemuck::cast_slice_mut(out);
        self.backend.download(buf, bytes);
    }

    pub fn compile(&self, jga_src: &str, entry: &str) -> CompiledKernel {
        crate::isa::compile(jga_src, entry, self.backend.target())
    }

    pub fn launch(
        &self,
        kernel: &CompiledKernel,
        grid: [u32; 3],
        block: [u32; 3],
        args: &[KernelArg],
    ) {
        self.backend.launch(kernel, grid, block, args);
    }
}
