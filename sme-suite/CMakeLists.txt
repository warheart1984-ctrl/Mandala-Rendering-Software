cmake_minimum_required(VERSION 3.20)
project(sme_suite LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Each module builds against ../../shared and ../../third_party.
# Modules are also standalone (build their own CMakeLists from the module dir).
add_subdirectory(modules/sme-vis)
add_subdirectory(modules/sme-gen)
add_subdirectory(modules/sme-aud)
add_subdirectory(modules/sme-txt)
