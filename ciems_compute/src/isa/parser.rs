use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ModuleIR { pub kernels: Vec<KernelIR> }

#[derive(Debug, Clone)]
pub struct KernelIR {
    pub name: String,
    pub params: Vec<Param>,
    pub regs: Vec<Reg>,
    pub shared: Vec<SharedDecl>,
    pub blocks: Vec<Block>,
    pub entry: String,
}

#[derive(Debug, Clone)]
pub struct Param { pub name: String, pub ty: ParamTy }

#[derive(Debug, Clone, PartialEq)]
pub enum ParamTy { GlobalF32Ptr, GlobalI32Ptr, U32, F32 }

#[derive(Debug, Clone)]
pub struct Reg { pub name: String, pub ty: RegTy }

#[derive(Debug, Clone, PartialEq)]
pub enum RegTy { F32, U32, Pred }

#[derive(Debug, Clone)]
pub struct SharedDecl { pub name: String, pub ty: String, pub len: usize }

#[derive(Debug, Clone)]
pub struct Block { pub id: String, pub insts: Vec<Inst> }

#[derive(Debug, Clone)]
pub enum Inst {
    Ld { space: String, dst: String, addr: String },
    St { space: String, addr: String, src: String },
    Add { dst: String, a: String, b: String },
    Mul { dst: String, a: String, b: String },
    Fma { dst: String, a: String, b: String, acc: String },
    Eml { dst: String, x: String, y: String },
    CmpLtU32 { dst_pred: String, a: String, b: String },
    MovF32 { dst: String, imm: f32 },
    MovU32 { dst: String, imm: u32 },
    GetGlobalId { dst: String, dim: u32 },
    GetLocalId { dst: String, dim: u32 },
    GetGroupId { dst: String, dim: u32 },
    MadLoU32 { dst: String, a: String, b: String, c: String },
    AddU32 { dst: String, a: String, b: String },
    GroupBarrier,
    FenceGlobal,
    FenceShared,
    Bra { target: String },
    CondBra { pred: String, target: String },
    Ret,
}

pub fn parse_jga(src: &str) -> ModuleIR {
    let mut kernels = Vec::new();
    let mut lines = src.lines().peekable();
    let mut current_kernel: Option<KernelIR> = None;

    while let Some(line) = lines.next() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(';') { continue; }

        if line.starts_with(".version") || line.starts_with(".target") {
            continue;
        }

        if line.starts_with(".kernel") {
            let name = line.split_whitespace().nth(1).unwrap_or("").trim_matches(|c| c=='('||c==')');
            current_kernel = Some(KernelIR {
                name: name.to_string(),
                params: vec![],
                regs: vec![],
                shared: vec![],
                blocks: vec![Block { id: "entry".into(), insts: vec![] }],
                entry: "entry".into(),
            });
            continue;
        }

        if line.starts_with("}") {
            if let Some(k) = current_kernel.take() {
                kernels.push(k);
            }
            continue;
        }

        if let Some(k) = current_kernel.as_mut() {
            if line.starts_with("param") {
                // param global_f32* A
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let ty_str = parts[1];
                    let name = parts[2].trim_end_matches(',');
                    let ty = match ty_str {
                        "global_f32*" => ParamTy::GlobalF32Ptr,
                        "global_i32*" => ParamTy::GlobalI32Ptr,
                        "u32" => ParamTy::U32,
                        "f32" => ParamTy::F32,
                        _ => ParamTy::U32,
                    };
                    k.params.push(Param { name: name.to_string(), ty });
                }
                continue;
            }
            if line.starts_with(".reg") {
                // .reg u32 i0
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let ty = match parts[1] {
                        "f32" => RegTy::F32,
                        "u32" => RegTy::U32,
                        _ => RegTy::U32,
                    };
                    k.regs.push(Reg { name: parts[2].to_string(), ty });
                }
                continue;
            }
            if line.starts_with(".shared") {
                // .shared f32 sA[TILE*TILE]
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let name = parts[2].split('[').next().unwrap_or("").to_string();
                    k.shared.push(SharedDecl { name, ty: parts[1].to_string(), len: 256 });
                }
                continue;
            }
            // instruction parsing
            let inst = parse_inst(line);
            if let Some(inst) = inst {
                if let Some(block) = k.blocks.last_mut() {
                    block.insts.push(inst);
                }
            }
        }
    }

    ModuleIR { kernels }
}

fn parse_inst(line: &str) -> Option<Inst> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.is_empty() { return None; }
    match tokens[0] {
        "ld.global.f32" => Some(Inst::Ld { space: "global".into(), dst: tokens[1].to_string(), addr: tokens[2..].join(" ") }),
        "st.global.f32" => Some(Inst::St { space: "global".into(), addr: tokens[1].to_string(), src: tokens[2].to_string() }),
        "add.f32" => Some(Inst::Add { dst: tokens[1].to_string(), a: tokens[2].to_string(), b: tokens[3].to_string() }),
        "mul.f32" => Some(Inst::Mul { dst: tokens[1].to_string(), a: tokens[2].to_string(), b: tokens[3].to_string() }),
        "fma.f32" => Some(Inst::Fma { dst: tokens[1].to_string(), a: tokens[2].to_string(), b: tokens[3].to_string(), acc: tokens[4].to_string() }),
        "eml.f32" => Some(Inst::Eml { dst: tokens[1].to_string(), x: tokens[2].to_string(), y: tokens[3].to_string() }),
        "cmp.lt.u32" => Some(Inst::CmpLtU32 { dst_pred: tokens[1].to_string(), a: tokens[2].to_string(), b: tokens[3].to_string() }),
        "group_barrier" => Some(Inst::GroupBarrier),
        "fence.global" => Some(Inst::FenceGlobal),
        "fence.shared" => Some(Inst::FenceShared),
        "bra" => Some(Inst::Bra { target: tokens[1].to_string() }),
        "ret" => Some(Inst::Ret),
        "get_global_id.u32" => Some(Inst::GetGlobalId { dst: tokens[1].to_string(), dim: tokens[2].parse().unwrap_or(0) }),
        "get_local_id.u32" => Some(Inst::GetLocalId { dst: tokens[1].to_string(), dim: tokens[2].parse().unwrap_or(0) }),
        "get_group_id.u32" => Some(Inst::GetGroupId { dst: tokens[1].to_string(), dim: tokens[2].parse().unwrap_or(0) }),
        "mad.lo.u32" => Some(Inst::MadLoU32 { dst: tokens[1].to_string(), a: tokens[2].to_string(), b: tokens[3].to_string(), c: tokens[4].to_string() }),
        "add.u32" => Some(Inst::Add { dst: tokens[1].to_string(), a: tokens[2].to_string(), b: tokens[3].to_string() }),
        _ => None,
    }
}
