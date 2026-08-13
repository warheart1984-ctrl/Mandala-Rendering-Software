cmake_minimum_required(VERSION 3.20)
project(axiom_native VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build configuration
option(BUILD_SHARED_LIBS "Build shared libraries" ON)
option(AXIOM_BUILD_TESTS "Build tests" ON)
option(AXIOM_SANITIZE "Enable sanitizers" OFF)

# Compiler flags
if (MSVC)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W4 /WX /EHsc")
else()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -Wextra -Wpedantic -Werror")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wno-unused-parameter -Wno-unused-variable")
endif()

if (AXIOM_SANITIZE)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsanitize=address,undefined -fno-omit-frame-pointer")
    set(CMAKE_EXE_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS} -fsanitize=address,undefined")
endif()

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

# Source files
set(AXIOM_SOURCES
    src/math/axiom_math.cpp
    src/scene/axiom_scene.cpp
    src/bvh/axiom_bvh.cpp
    src/integrator/axiom_integrator.cpp
    src/cpu/axiom_context.cpp
)

# Headers
set(AXIOM_HEADERS
    include/axiom/axiom_abi.h
    include/axiom/axiom_math.h
    include/axiom/axiom_scene.h
    include/axiom/axiom_bvh.h
    include/axiom/axiom_integrator.h
)

# Library
add_library(axiom_native ${AXIOM_SOURCES})
target_include_directories(axiom_native PUBLIC include)
set_target_properties(axiom_native PROPERTIES
    VERSION ${PROJECT_VERSION}
    SOVERSION ${PROJECT_VERSION_MAJOR}
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN ON
)

# Install
install(TARGETS axiom_native
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
    RUNTIME DESTINATION bin
)
install(FILES ${AXIOM_HEADERS} DESTINATION include/axiom)

# Tests
if (AXIOM_BUILD_TESTS)
    enable_testing()
    
    add_executable(axiom_test_scene
        test/test_scene.cpp
    )
    target_link_libraries(axiom_test_scene axiom_native)
    add_test(NAME test_scene COMMAND axiom_test_scene)
    
    add_executable(axiom_test_bvh
        test/test_bvh.cpp
    )
    target_link_libraries(axiom_test_bvh axiom_native)
    add_test(NAME test_bvh COMMAND axiom_test_bvh)
    
    add_executable(axiom_test_integrator
        test/test_integrator.cpp
    )
    target_link_libraries(axiom_test_integrator axiom_native)
    add_test(NAME test_integrator COMMAND axiom_test_integrator)
    
    add_executable(axiom_test_determinism
        test/test_determinism.cpp
    )
    target_link_libraries(axiom_test_determinism axiom_native)
    add_test(NAME test_determinism COMMAND axiom_test_determinism)
endif()

# Packaging
set(CPACK_PACKAGE_NAME "axiom-native")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
include(CPack)