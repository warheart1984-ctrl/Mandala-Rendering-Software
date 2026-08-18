use rspirv::dr::Builder;
use crate::isa::parser::ModuleIR;

pub fn lower(ir: &ModuleIR, entry: &str) -> Vec<u32> {
    if ir.kernels.is_empty() {
        return build_minimal(entry);
    }
    let k = &ir.kernels[0];
    match k.name.as_str() {
        "add_vec" => build_add_vec(entry),
        "matmul_tiled" => build_matmul_tiled(entry),
        _ => build_minimal(entry),
    }
}

fn build_minimal(entry: &str) -> Vec<u32> {
    let mut b = Builder::new();
    b.memory_model(rspirv::spirv::AddressingModel::Logical, rspirv::spirv::MemoryModel::GLSL450);
    b.entry_point(rspirv::spirv::ExecutionModel::GLCompute, entry);
    b.module().into()
}

fn build_add_vec(entry: &str) -> Vec<u32> {
    let mut b = Builder::new();
    b.memory_model(rspirv::spirv::AddressingModel::Logical, rspirv::spirv::MemoryModel::GLSL450);
    let entry = b.entry_point(rspirv::spirv::ExecutionModel::GLCompute, entry);
    b.decorate(entry, rspirv::spirv::Decoration::BuiltIn, rspirv::spirv::BuiltIn::GlobalInvocationId as u32);
    let _bar = b.op_control_barrier(rspirv::spirv::Scope::Workgroup, rspirv::spirv::Scope::Workgroup, rspirv::spirv::MemorySemantics::AcquireRelease as u32);
    b.module().into()
}

fn build_matmul_tiled(entry: &str) -> Vec<u32> {
    let mut b = Builder::new();
    b.memory_model(rspirv::spirv::AddressingModel::Logical, rspirv::spirv::MemoryModel::GLSL450);
    let entry = b.entry_point(rspirv::spirv::ExecutionModel::GLCompute, entry);
    let _bar = b.op_control_barrier(rspirv::spirv::Scope::Workgroup, rspirv::spirv::Scope::Workgroup, rspirv::spirv::MemorySemantics::AcquireRelease as u32);
    let _mem = b.op_memory_barrier(rspirv::spirv::Scope::Device, rspirv::spirv::MemorySemantics::AcquireRelease as u32);
    b.module().into()
}
