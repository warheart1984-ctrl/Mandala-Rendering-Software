"""Axiom-X Runtime — GPU execution with workgroup autotuning, memory hierarchy optimization, and kernel fusion.

STATUS: **partial** — OpenCL backend operational on RX 580;
Vulkan/WGSL, CUDA, HIP, Metal, DX12 declared only.

Exports:
  - AxiomXRuntime: main execution class
  - WorkgroupTuner: autotuning pipeline
  - MemoryTuner: joint workgroup + memory hierarchy tuning
  - FusionTuner: joint fusion + workgroup + memory tuning
  - TuningCache: persistent tuning cache
  - TuningKey: cache key fingerprinting
  - MemoryConfig: memory hierarchy configuration
"""

from .axiom_x_runtime import (
    AxiomXRuntime,
    KernelIdentity,
    MathIR,
    InputSpec,
    JobIdentity,
    DeviceInfo,
    DispatchConfig,
    ExecutionIdentity,
    NumericalSummary,
    Provenance,
    ResultIdentity,
    AxiomXResult,
    run_legacy_efficient,
)

from .math_4d import (
    Projector4D,
    BVH4D,
    Vertex4D,
    Vertex3D,
    Vec4,
    Mat4x4,
    Geometry4D,
    select_lod_4d,
    compute_projection_matrix,
)

from .workgroup_tuner import (
    WorkgroupTuner,
    tune_workgroup,
)

from .memory_tuner import (
    MemoryTuner,
    tune_memory_hierarchy,
)

from .fusion_tuner import (
    FusionTuner,
    tune_fusion,
)

from .pipeline import (
    AsyncPipeline,
    PipelineBuilder,
    PipelineConfig,
    PipelineStage,
    PipelineBuffer,
    PipelineFrame,
)

from .multi_gpu import (
    MultiGPUExecutor,
    MultiGPUConfig,
    MultiGPUResult,
    DistributionStrategy,
    WorkPartition,
    GPUDevice,
    WorkSlice,
    create_multi_gpu_executor,
)

from .backend import (
    BackendExecutor,
    BackendType,
    DeviceType,
    BackendDevice,
    BackendBuffer,
    BackendKernel,
    BackendEvent,
    BackendInterface,
    OpenCLBackend,
    CPUBackend,
    HIPBackend,
    CUDABackend,
    VulkanBackend,
    MetalBackend,
    get_backend,
    get_available_backends,
    enumerate_all_devices,
)

from .tuning_cache import (
    TuningCache,
    TuningEvidence,
    CandidateResult,
)

from .tuning_key import (
    TuningKey,
    DeviceFingerprint,
    KernelFingerprint,
    ProblemShape,
    TUNING_KEY_JSON_SCHEMA,
)

from .memory_hierarchy import (
    MemoryConfig,
    BufferSpec,
    MemorySpace,
    AccessPattern,
    create_global_only_config,
    create_local_tiled_config,
    create_pinned_host_config,
    create_persistent_mapping_config,
    MEMORY_CONFIG_JSON_SCHEMA,
)

from .memory_analyzer import (
    analyze_kernel_memory_access,
    BufferAccessSummary,
    AccessPatternAnalyzer,
)

from .memory_benchmark import (
    MemoryBenchmark,
    MemoryBenchmarkResult,
    select_best_memory_config,
)

from .kernel_fusion import (
    KernelSpec,
    KernelArg,
    KernelDependency,
    DependencyType,
    FusionCandidate,
    FusionStrategy,
    FusedKernelSpec,
    FusionConstraints,
    FUSION_CANDIDATE_JSON_SCHEMA,
)

from .fusion_analyzer import (
    DependencyGraph,
    FusionOpportunityAnalyzer,
    analyze_fusion_opportunities,
    KernelSequence,
)

from .fusion_generator import (
    KernelBodyExtractor,
    HorizontalFusionGenerator,
    VerticalFusionGenerator,
    TileBasedFusionGenerator,
    generate_fused_kernel,
)

from .fusion_benchmark import (
    FusionBenchmark,
    FusionBenchmarkResult,
    select_best_fusion,
    analyze_and_benchmark_fusion,
)

from ..benchmark.benchmark_workgroups import (
    BenchmarkConfig,
    BenchmarkResult,
    run_benchmark,
    select_best_candidate,
    create_opencl_benchmark_fn,
    create_wall_time_benchmark_fn,
)

__all__ = [
    # Core runtime
    "AxiomXRuntime",
    "KernelIdentity",
    "MathIR",
    "InputSpec",
    "JobIdentity",
    "DeviceInfo",
    "DispatchConfig",
    "ExecutionIdentity",
    "NumericalSummary",
    "Provenance",
    "ResultIdentity",
    "AxiomXResult",
    "run_legacy_efficient",
    # 4D Math
    "Projector4D",
    "BVH4D",
    "Vertex4D",
    "Vertex3D",
    "Vec4",
    "Mat4x4",
    "Geometry4D",
    "select_lod_4d",
    "compute_projection_matrix",
    # Workgroup autotuning
    "WorkgroupTuner",
    "tune_workgroup",
    # Memory hierarchy
    "MemoryTuner",
    "tune_memory_hierarchy",
    # Kernel fusion
    "FusionTuner",
    "tune_fusion",
    # Pipeline
    "AsyncPipeline",
    "PipelineBuilder",
    "PipelineConfig",
    "PipelineStage",
    "PipelineBuffer",
    "PipelineFrame",
    # Multi-GPU
    "MultiGPUExecutor",
    "MultiGPUConfig",
    "MultiGPUResult",
    "DistributionStrategy",
    "WorkPartition",
    "GPUDevice",
    "WorkSlice",
    "create_multi_gpu_executor",
    # Backend abstraction
    "BackendExecutor",
    "BackendType",
    "DeviceType",
    "BackendDevice",
    "BackendBuffer",
    "BackendKernel",
    "BackendEvent",
    "BackendInterface",
    "OpenCLBackend",
    "CPUBackend",
    "HIPBackend",
    "CUDABackend",
    "VulkanBackend",
    "MetalBackend",
    "get_backend",
    "get_available_backends",
    "enumerate_all_devices",
    # Cache
    "TuningCache",
    "TuningEvidence",
    "CandidateResult",
    # Keys
    "TuningKey",
    "DeviceFingerprint",
    "KernelFingerprint",
    "ProblemShape",
    "TUNING_KEY_JSON_SCHEMA",
    # Memory hierarchy types
    "MemoryConfig",
    "BufferSpec",
    "MemorySpace",
    "AccessPattern",
    "create_global_only_config",
    "create_local_tiled_config",
    "create_pinned_host_config",
    "create_persistent_mapping_config",
    "MEMORY_CONFIG_JSON_SCHEMA",
    "analyze_kernel_memory_access",
    "BufferAccessSummary",
    "AccessPatternAnalyzer",
    "MemoryBenchmark",
    "MemoryBenchmarkResult",
    "select_best_memory_config",
    # Kernel fusion types
    "KernelSpec",
    "KernelArg",
    "KernelDependency",
    "DependencyType",
    "FusionCandidate",
    "FusionStrategy",
    "FusedKernelSpec",
    "FusionConstraints",
    "FUSION_CANDIDATE_JSON_SCHEMA",
    "DependencyGraph",
    "FusionOpportunityAnalyzer",
    "analyze_fusion_opportunities",
    "KernelSequence",
    "KernelBodyExtractor",
    "HorizontalFusionGenerator",
    "VerticalFusionGenerator",
    "TileBasedFusionGenerator",
    "generate_fused_kernel",
    "FusionBenchmark",
    "FusionBenchmarkResult",
    "select_best_fusion",
    "analyze_and_benchmark_fusion",
    # Benchmark
    "BenchmarkConfig",
    "BenchmarkResult",
    "run_benchmark",
    "select_best_candidate",
    "create_opencl_benchmark_fn",
    "create_wall_time_benchmark_fn",
]