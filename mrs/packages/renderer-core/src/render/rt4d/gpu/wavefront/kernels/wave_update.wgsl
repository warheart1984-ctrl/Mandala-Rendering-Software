// wave_update.wgsl — Phase C declared discrete scalar wave update (Drive-G-1)
struct WaveGrid { nx : u32, ny : u32, nz : u32, c : f32, dt : f32, }
@group(0) @binding(0) var<uniform> grid : WaveGrid;
@group(0) @binding(1) var<storage, read> psiPrev : array<f32>;
@group(0) @binding(2) var<storage, read> psiCurr : array<f32>;
@group(0) @binding(3) var<storage, read_write> psiNext : array<f32>;
fn index(ix : u32, iy : u32, iz : u32) -> u32 {
  return iz * grid.nx * grid.ny + iy * grid.nx + ix;
}
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id : vec3<u32>) {
  let ix = id.x; let iy = id.y; let iz = id.z;
  if (ix == 0u || iy == 0u || iz == 0u ||
      ix >= grid.nx - 1u || iy >= grid.ny - 1u || iz >= grid.nz - 1u) { return; }
  let i = index(ix, iy, iz);
  let lap = psiCurr[index(ix+1u,iy,iz)] + psiCurr[index(ix-1u,iy,iz)] +
            psiCurr[index(ix,iy+1u,iz)] + psiCurr[index(ix,iy-1u,iz)] +
            psiCurr[index(ix,iy,iz+1u)] + psiCurr[index(ix,iy,iz-1u)] - 6.0 * psiCurr[i];
  let c2dt2 = grid.c * grid.c * grid.dt * grid.dt;
  psiNext[i] = 2.0 * psiCurr[i] - psiPrev[i] + c2dt2 * lap;
}
