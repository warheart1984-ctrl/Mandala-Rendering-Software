cmake_minimum_required(VERSION 3.20)
project(mrs_lrc_adapter LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(SUITE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../sme-suite")

add_executable(mrs_lrc_adapter
  src/mrs_lrc_adapter.cpp
  src/main.cpp
  ${SUITE_ROOT}/shared/contract_engine.cpp
)

target_include_directories(mrs_lrc_adapter PRIVATE
  src
  ${SUITE_ROOT}/shared
  ${SUITE_ROOT}/modules/sme-router/src
  ${SUITE_ROOT}/third_party
  ${SUITE_ROOT}/third_party/nlohmann
)

if(MSVC)
  target_compile_options(mrs_lrc_adapter PRIVATE /EHsc /utf-8 /W3)
endif()

# Copy config
configure_file(src/adapter_config.json ${CMAKE_CURRENT_BINARY_DIR}/adapter_config.json COPYONLY)