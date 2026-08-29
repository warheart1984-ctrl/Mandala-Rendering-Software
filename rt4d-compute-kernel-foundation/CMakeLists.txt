cmake_minimum_required(VERSION 3.20)
project(rt4d_compute_kernel_foundation LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR})

add_library(rt4d_kernel_contract STATIC
    ${SRC_DIR}/kernels/cpu/rt4d_kernel_contract.cpp
    ${SRC_DIR}/kernels/cpu/rt4d_matvec.cpp
)
target_include_directories(rt4d_kernel_contract PUBLIC ${SRC_DIR})
if(MSVC)
    target_compile_options(rt4d_kernel_contract PRIVATE /W4 /WX)
else()
    target_compile_options(rt4d_kernel_contract PRIVATE
        -Wall -Wextra -Wpedantic -Werror)
endif()

find_package(Vulkan REQUIRED)

add_library(rt4d_vulkan_diagnostic STATIC
    ${SRC_DIR}/kernels/vulkan/rt4d_diagnostic_dispatcher.cpp
    ${SRC_DIR}/kernels/vulkan/rt4d_pentachoron_diagnostic.cpp
    ${SRC_DIR}/kernels/vulkan/rt4d_matvec_diagnostic.cpp
)
target_include_directories(rt4d_vulkan_diagnostic PUBLIC ${SRC_DIR})
target_link_libraries(rt4d_vulkan_diagnostic PUBLIC
    rt4d_kernel_contract Vulkan::Vulkan)
if(MSVC)
    target_compile_options(rt4d_vulkan_diagnostic PRIVATE /W4 /WX)
else()
    target_compile_options(rt4d_vulkan_diagnostic PRIVATE
        -Wall -Wextra -Wpedantic -Werror)
endif()

add_executable(rt4d_pentachoron_intake
    ${SRC_DIR}/tools/rt4d_pentachoron_intake.cpp)
target_link_libraries(rt4d_pentachoron_intake PRIVATE rt4d_vulkan_diagnostic)
if(MSVC)
    target_compile_options(rt4d_pentachoron_intake PRIVATE /W4 /WX)
else()
    target_compile_options(rt4d_pentachoron_intake PRIVATE
        -Wall -Wextra -Wpedantic -Werror)
endif()

find_program(GLSLC glslc)
if(NOT GLSLC)
    message(FATAL_ERROR "glslc is required to compile diagnostic compute shaders")
endif()

set(SPIRV_DIR ${CMAKE_CURRENT_BINARY_DIR}/spirv)
file(MAKE_DIRECTORY ${SPIRV_DIR})
set(PENTACHORON_SPV ${SPIRV_DIR}/bvh4d_pentachoron_traverse.comp.spv)
set(MATVEC_SPV ${SPIRV_DIR}/matvec_clean.comp.spv)

add_custom_command(
    OUTPUT ${PENTACHORON_SPV}
    COMMAND ${GLSLC} -fshader-stage=compute
        ${SRC_DIR}/kernels/vulkan/bvh4d_pentachoron_traverse.comp.glsl
        -o ${PENTACHORON_SPV}
    DEPENDS ${SRC_DIR}/kernels/vulkan/bvh4d_pentachoron_traverse.comp.glsl
    COMMENT "Compiling pentachoron BVH compute shader"
)
add_custom_command(
    OUTPUT ${MATVEC_SPV}
    COMMAND ${GLSLC} -fshader-stage=compute
        ${SRC_DIR}/kernels/vulkan/matvec_clean.comp.glsl
        -o ${MATVEC_SPV}
    DEPENDS ${SRC_DIR}/kernels/vulkan/matvec_clean.comp.glsl
    COMMENT "Compiling matvec_clean compute shader"
)
add_custom_target(rt4d_diagnostic_shaders ALL
    DEPENDS ${PENTACHORON_SPV} ${MATVEC_SPV})
add_executable(rt4d_matvec_receipt
    ${SRC_DIR}/tools/rt4d_matvec_receipt.cpp)
target_link_libraries(rt4d_matvec_receipt PRIVATE rt4d_vulkan_diagnostic)
add_dependencies(rt4d_matvec_receipt rt4d_diagnostic_shaders)
if(MSVC)
    target_compile_options(rt4d_matvec_receipt PRIVATE /W4 /WX)
else()
    target_compile_options(rt4d_matvec_receipt PRIVATE
        -Wall -Wextra -Wpedantic -Werror)
endif()

include(CTest)
if(BUILD_TESTING)
    add_executable(rt4d_kernel_contract_tests
        ${SRC_DIR}/tests/rt4d_kernel_contract_test.cpp)
    target_link_libraries(rt4d_kernel_contract_tests PRIVATE
        rt4d_kernel_contract)
    if(MSVC)
        target_compile_options(rt4d_kernel_contract_tests PRIVATE /W4 /WX)
    else()
        target_compile_options(rt4d_kernel_contract_tests PRIVATE
            -Wall -Wextra -Wpedantic -Werror)
    endif()
    add_test(NAME rt4d_kernel_cpu_contract COMMAND rt4d_kernel_contract_tests
        ${SRC_DIR}/fixtures/pentachora-v0.1.rt4d)

    add_executable(rt4d_kernel_vulkan_tests
        ${SRC_DIR}/tests/rt4d_kernel_vulkan_test.cpp)
    target_link_libraries(rt4d_kernel_vulkan_tests PRIVATE
        rt4d_vulkan_diagnostic)
    add_dependencies(rt4d_kernel_vulkan_tests rt4d_diagnostic_shaders)
    if(MSVC)
        target_compile_options(rt4d_kernel_vulkan_tests PRIVATE /W4 /WX)
    else()
        target_compile_options(rt4d_kernel_vulkan_tests PRIVATE
            -Wall -Wextra -Wpedantic -Werror)
    endif()

    option(RT4D_RUN_LIVE_GPU_KERNEL_TESTS
        "Run Vulkan kernel parity tests through CTest" OFF)
    if(RT4D_RUN_LIVE_GPU_KERNEL_TESTS)
        add_test(
            NAME rt4d_kernel_vulkan_contract
            COMMAND rt4d_kernel_vulkan_tests
                ${PENTACHORON_SPV}
                ${MATVEC_SPV}
                ${SRC_DIR}/fixtures/pentachora-v0.1.rt4d
        )
    endif()
endif()
