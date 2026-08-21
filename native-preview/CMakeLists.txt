cmake_minimum_required(VERSION 3.20)
project(mandala-native VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CXX_STANDARD_REQUIRED ON)

# ── Platform detection ────────────────────────────────────────────────
if(WIN32)
    add_definitions(-DVK_USE_PLATFORM_WIN32_KHR)
else()
    add_definitions(-DVK_USE_PLATFORM_XLIB_KHR)
    find_package(X11 REQUIRED)
endif()

# ── Vulkan ────────────────────────────────────────────────────────────
find_package(Vulkan REQUIRED)
if(NOT Vulkan_FOUND)
    message(FATAL_ERROR "Vulkan SDK required.")
endif()
message(STATUS "Vulkan: ${Vulkan_INCLUDE_DIRS}")

# ── Vulkan Compute Engine (cross-platform library) ────────────────────
add_library(vulkan_compute_engine SHARED
    src/VulkanComputeEngine.cpp
)

target_include_directories(vulkan_compute_engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(vulkan_compute_engine PRIVATE
    ${Vulkan_LIBRARIES}
)

if(NOT WIN32)
    target_link_libraries(vulkan_compute_engine PRIVATE X11)
endif()

set_target_properties(vulkan_compute_engine PROPERTIES
    OUTPUT_NAME "vulkan-compute-engine"
    PREFIX "lib"
)

# ── SPIR-V Compilation Helper ────────────────────────────────────────
add_executable(spirv_compile
    src/SpirvCompile.cpp
)

target_include_directories(spirv_compile PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(spirv_compile PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

set_target_properties(spirv_compile PROPERTIES
    OUTPUT_NAME "spirv-compile"
    PREFIX ""
)

# ── Vulkan Producer DLL ──────────────────────────────────────────────
add_library(vulkan_producer SHARED
    src/VulkanProducer.cpp
)

target_include_directories(vulkan_producer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(vulkan_producer PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

set_target_properties(vulkan_producer PROPERTIES
    OUTPUT_NAME "vulkan-producer"
    PREFIX ""
)

# ── Preview Executable ───────────────────────────────────────────────
add_executable(preview_window
    src/PreviewWindow.cpp
)

target_include_directories(preview_window PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

if(WIN32)
    target_link_libraries(preview_window PRIVATE
        ${Vulkan_LIBRARIES}
        user32 gdi32
    )
    set_target_properties(preview_window PROPERTIES WIN32_EXECUTABLE TRUE)
else()
    target_link_libraries(preview_window PRIVATE
        ${Vulkan_LIBRARIES}
        ${X11_LIBRARIES}
        vulkan_compute_engine
    )
endif()

set_target_properties(preview_window PROPERTIES OUTPUT_NAME "4d-preview" PREFIX "")

# ── Benchmarks ─────────────────────────────────────────────────────────
add_executable(benchmark_stock
    benchmark_stock.cpp
)

target_include_directories(benchmark_stock PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_stock PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_stock PRIVATE X11)
endif()

set_target_properties(benchmark_stock PROPERTIES OUTPUT_NAME "benchmark-stock" PREFIX "")

add_executable(benchmark_optimized
    benchmark_optimized.cpp
)

target_include_directories(benchmark_optimized PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_optimized PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_optimized PRIVATE X11)
endif()

set_target_properties(benchmark_optimized PROPERTIES OUTPUT_NAME "benchmark-optimized" PREFIX "")

add_executable(benchmark_minimal
    benchmark_minimal.cpp
)

target_include_directories(benchmark_minimal PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_minimal PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_minimal PRIVATE X11)
endif()

set_target_properties(benchmark_minimal PROPERTIES OUTPUT_NAME "benchmark-minimal" PREFIX "")

add_executable(benchmark_stock_timed
    benchmark_stock_timed.cpp
)

target_include_directories(benchmark_stock_timed PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_stock_timed PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_stock_timed PRIVATE X11)
endif()

set_target_properties(benchmark_stock_timed PROPERTIES OUTPUT_NAME "benchmark-stock-timed" PREFIX "")

add_executable(benchmark_optimized_timed
    benchmark_optimized_timed.cpp
)

target_include_directories(benchmark_optimized_timed PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_optimized_timed PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_optimized_timed PRIVATE X11)
endif()

set_target_properties(benchmark_optimized_timed PROPERTIES OUTPUT_NAME "benchmark-optimized-timed" PREFIX "")

add_executable(benchmark_rt4d
    benchmark_rt4d.cpp
)

target_include_directories(benchmark_rt4d PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_rt4d PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_rt4d PRIVATE X11)
endif()

set_target_properties(benchmark_rt4d PROPERTIES OUTPUT_NAME "benchmark-rt4d" PREFIX "")

add_executable(benchmark_large
    benchmark_large.cpp
)

target_include_directories(benchmark_large PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_large PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_large PRIVATE X11)
endif()

set_target_properties(benchmark_large PROPERTIES OUTPUT_NAME "benchmark-large" PREFIX "")

add_executable(benchmark_rt4d_glsl
    benchmark_rt4d_glsl.cpp
)

target_include_directories(benchmark_rt4d_glsl PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${Vulkan_INCLUDE_DIRS}
)

target_link_libraries(benchmark_rt4d_glsl PRIVATE
    ${Vulkan_LIBRARIES}
    vulkan_compute_engine
)

if(NOT WIN32)
    target_link_libraries(benchmark_rt4d_glsl PRIVATE X11)
endif()

set_target_properties(benchmark_rt4d_glsl PROPERTIES OUTPUT_NAME "benchmark-rt4d-glsl" PREFIX "")

# ── Install ───────────────────────────────────────────────────────────
install(TARGETS vulkan_compute_engine vulkan_producer spirv_compile preview_window benchmark_stock benchmark_optimized benchmark_minimal benchmark_stock_timed benchmark_optimized_timed benchmark_rt4d benchmark_large benchmark_rt4d_glsl DESTINATION bin)
install(DIRECTORY include/ DESTINATION include)
