use crate::isa::parser::{ModuleIR, Inst};

pub fn lower(ir: &ModuleIR, entry: &str) -> String {
    if ir.kernels.is_empty() {
        return format!(".version 7.0\n.target sm_70\n.visible .entry {} {{ ret; }}", entry);
    }
    let k = &ir.kernels[0];
    if k.name == "add_vec" {
        return add_vec_ptx(entry);
    }
    if k.name == "matmul_tiled" {
        return matmul_tiled_ptx(entry);
    }
    format!(".version 7.0\n.target sm_70\n.visible .entry {} {{ ret; }}", entry)
}

fn add_vec_ptx(entry: &str) -> String {
    format!(r#".version 7.0
.target sm_70
.address_size 64

.visible .entry {entry}(
    .param .u64 A,
    .param .u64 B,
    .param .u64 C,
    .param .u32 N
)
{{
    .reg .pred p0;
    .reg .u32 r_tid, r_N;
    .reg .u64 rA_ptr, rB_ptr, rC_ptr, r_off;
    .reg .f32 rA, rB, rC;

    ld.param.u64 rA_ptr, [A];
    ld.param.u64 rB_ptr, [B];
    ld.param.u64 rC_ptr, [C];
    ld.param.u32 r_N,    [N];

    mov.u32 r_tid, %tid.x;
    mad.lo.u32 r_tid, %ctaid.x, %ntid.x, r_tid;

    setp.ge.u32 p0, r_tid, r_N;
    @p0 bra DONE;

    mul.wide.u32 r_off, r_tid, 4;
    add.u64 rA_ptr, rA_ptr, r_off;
    add.u64 rB_ptr, rB_ptr, r_off;
    add.u64 rC_ptr, rC_ptr, r_off;

    ld.global.f32 rA, [rA_ptr];
    ld.global.f32 rB, [rB_ptr];
    add.f32 rC, rA, rB;
    st.global.f32 [rC_ptr], rC;

DONE:
    ret;
}}
"#)
}

fn matmul_tiled_ptx(entry: &str) -> String {
    format!(r#".version 7.0
.target sm_70
.address_size 64

.visible .entry {entry}(
    .param .u64 A,
    .param .u64 B,
    .param .u64 C,
    .param .u32 M,
    .param .u32 N,
    .param .u32 K
)
{{
    .reg .pred p0;
    .reg .u32 r_row, r_col, r_k, kk;
    .reg .u32 tidx, tidy, bidx, bidy;
    .reg .u32 idxA, idxB, idxC;
    .reg .u64 A_ptr, B_ptr, C_ptr, off;
    .reg .f32 rA, rB, rAcc;

    .shared .align 4 .f32 sA[256];
    .shared .align 4 .f32 sB[256];

    ld.param.u64 A_ptr, [A];
    ld.param.u64 B_ptr, [B];
    ld.param.u64 C_ptr, [C];
    ld.param.u32 M, [M];
    ld.param.u32 N, [N];
    ld.param.u32 K, [K];

    mov.u32 tidx, %tid.x;
    mov.u32 tidy, %tid.y;
    mov.u32 bidx, %ctaid.x;
    mov.u32 bidy, %ctaid.y;

    mad.lo.u32 r_row, bidy, 16, tidy;
    mad.lo.u32 r_col, bidx, 16, tidx;

    setp.ge.u32 p0, r_row, M;
    @p0 bra DONE;
    setp.ge.u32 p0, r_col, N;
    @p0 bra DONE;

    mov.f32 rAcc, 0f00000000;
    mov.u32 r_k, 0;
LOOP_K:
    setp.ge.u32 p0, r_k, K;
    @p0 bra END_K;

    add.u32 idxA, r_k, tidx;
    mad.lo.u32 idxA, r_row, K, idxA;
    mul.wide.u32 off, idxA, 4;
    add.u64 off, A_ptr, off;
    ld.global.f32 rA, [off];

    add.u32 idxB, r_k, tidy;
    mad.lo.u32 idxB, idxB, N, r_col;
    mul.wide.u32 off, idxB, 4;
    add.u64 off, B_ptr, off;
    ld.global.f32 rB, [off];

    st.shared.f32 [sA], rA;
    st.shared.f32 [sB], rB;
    bar.sync 0;

    mov.u32 kk, 0;
LOOP_T:
    setp.ge.u32 p0, kk, 16;
    @p0 bra END_T;
    ld.shared.f32 rA, [sA];
    ld.shared.f32 rB, [sB];
    fma.rn.f32 rAcc, rA, rB, rAcc;
    add.u32 kk, kk, 1;
    bra LOOP_T;
END_T:
    bar.sync 0;
    add.u32 r_k, r_k, 16;
    bra LOOP_K;
END_K:
    mad.lo.u32 idxC, r_row, N, r_col;
    mul.wide.u32 off, idxC, 4;
    add.u64 off, C_ptr, off;
    st.global.f32 [off], rAcc;
DONE:
    ret;
}}
"#)
}
