use ciems_compute::{Engine, backend::cuda::CudaBackend, backend::vulkan::VulkanBackend, KernelArg, Scalar};

#[test]
fn add_vec_conformance() {
    let n = 1024;
    let a: Vec<f32> = (0..n).map(|i| i as f32).collect();
    let b: Vec<f32> = (0..n).map(|i| (2*i) as f32).collect();
    let mut c_cuda = vec![0.0; n];
    let mut c_vk = vec![0.0; n];

    let jga = include_str!("add_vec.jga");

    // CUDA path
    let cuda = CudaBackend::new(0);
    let engine_cuda = Engine::new(cuda);
    let k_cuda = engine_cuda.compile(jga, "add_vec");
    let a_buf = engine_cuda.alloc_f32(n);
    let b_buf = engine_cuda.alloc_f32(n);
    let c_buf = engine_cuda.alloc_f32(n);
    engine_cuda.upload_f32(&a_buf, &a);
    engine_cuda.upload_f32(&b_buf, &b);
    engine_cuda.launch(&k_cuda, [((n+255)/256) as u32,1,1], [256,1,1], &[KernelArg::Buffer(&a_buf), KernelArg::Buffer(&b_buf), KernelArg::Buffer(&c_buf), KernelArg::Scalar(Scalar::U32(n as u32))]);
    engine_cuda.download_f32(&c_buf, &mut c_cuda);

    // Vulkan path
    let vk = VulkanBackend::new();
    let engine_vk = Engine::new(vk);
    let k_vk = engine_vk.compile(jga, "add_vec");
    let a_buf_vk = engine_vk.alloc_f32(n);
    let b_buf_vk = engine_vk.alloc_f32(n);
    let c_buf_vk = engine_vk.alloc_f32(n);
    engine_vk.upload_f32(&a_buf_vk, &a);
    engine_vk.upload_f32(&b_buf_vk, &b);
    engine_vk.launch(&k_vk, [((n+255)/256) as u32,1,1], [256,1,1], &[KernelArg::Buffer(&a_buf_vk), KernelArg::Buffer(&b_buf_vk), KernelArg::Buffer(&c_buf_vk), KernelArg::Scalar(Scalar::U32(n as u32))]);
    engine_vk.download_f32(&c_buf_vk, &mut c_vk);

    assert_eq!(c_cuda, c_vk);
}
