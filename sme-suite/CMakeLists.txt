cmake_minimum_required(VERSION 3.20)
project(sme_suite LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Use GCC or Clang instead of MSVC
if(NOT MSVC)
    set(CMAKE_C_COMPILER gcc)
    set(CMAKE_CXX_COMPILER g++)
    message(STATUS "Using GCC/Clang compiler")
endif()

# Default build type if not specified
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS "Debug" "Release" "MinSizeRel" "RelWithDebInfo")
endif()

# Each module builds against ../../shared and ../../third_party.
# Modules are also standalone (build their own CMakeLists from the module dir).
add_subdirectory(modules/sme-vis)
add_subdirectory(modules/sme-gen)
add_subdirectory(modules/sme-aud)
add_subdirectory(modules/sme-txt)