pub mod parser;
pub mod lower_ptx;
pub mod lower_spirv;
pub mod eml;

use crate::{CompiledKernel, Target, BackendHandle};

pub fn compile(src: &str, entry: &str, target: Target) -> CompiledKernel {
    let ir = parser::parse_jga(src);
    match target {
        Target::NvidiaPtx => {
            let ptx = lower_ptx::lower(&ir, entry);
            let (module, func) = crate::backend::cuda::CudaBackend::load_ptx(&ptx, entry);
            CompiledKernel {
                target,
                handle: BackendHandle::Cuda { module, func },
            }
        }
        Target::VulkanSpirv => {
            let spirv = lower_spirv::lower(&ir, entry);
            let (pipeline, layout) = crate::backend::vulkan::VulkanBackend::create_pipeline(&spirv);
            CompiledKernel {
                target,
                handle: BackendHandle::Vulkan { pipeline, layout },
            }
        }
    }
}
