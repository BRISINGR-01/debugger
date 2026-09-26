cmake_minimum_required(VERSION 3.16)

project(CXXInstrumenter C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(CMAKE_BUILD_TYPE Debug CACHE STRING "Build type" FORCE)

enable_testing()


# ============================================================
# Dependencies
# ============================================================

find_package(LLVM REQUIRED CONFIG)
message(STATUS "Found LLVM ${LLVM_PACKAGE_VERSION} -> ${LLVM_DIR}")

find_package(Clang REQUIRED CONFIG)
message(STATUS "Found Clang headers in ${CLANG_INCLUDE_DIRS}")

find_package(nlohmann_json 3.12.0 REQUIRED)

include_directories(SYSTEM
    ${LLVM_INCLUDE_DIRS}
    ${CLANG_INCLUDE_DIRS}
)

add_definitions(${LLVM_DEFINITIONS})


# ============================================================
# Shared Library
# ============================================================

set(SRC "src")

add_library(${SRC} SHARED
    src/instrumenter/instrumenter.cpp
    src/instrumenter/functions.cpp
    src/instrumenter/expressions.cpp
    src/instrumenter/include/instrumenter.hpp
    src/instrumenter/utils.cpp
    src/instrumenter/include/utils.hpp
    src/instrumenter/construct_calls.cpp
    src/instrumenter/include/construct_calls.hpp
    src/instrumenter/schema.cpp
    src/instrumenter/include/schema.hpp
    src/instrumenter/serialize/ValueSerializer.cpp
    src/instrumenter/serialize/ValueSerializer.hpp
    src/instrumenter/serialize/json.cpp
    src/instrumenter/serialize/json.hpp
)

# clang-cpp contains the Clang libraries.
# LLVM is explicitly linked because the shared library uses LLVM symbols.
if(TARGET clang-cpp)
    target_link_libraries(${SRC}
        PRIVATE
        nlohmann_json::nlohmann_json
        clang-cpp
        LLVM
    )
else()
    target_link_libraries(${SRC}
        PRIVATE
        nlohmann_json::nlohmann_json
        clangAST
        clangASTMatchers
        clangBasic
        clangFrontend
        clangLex
        clangRewrite
        clangTooling
        LLVM
    )
endif()


# ============================================================
# Instrumenter Plugin
# ============================================================

set(PLUGIN_NAME "Instrumenter")

add_library(${PLUGIN_NAME} MODULE src/plugin.cpp)

target_compile_options(${PLUGIN_NAME} PRIVATE -O0 -g)

# The plugin uses the shared library above.
target_link_libraries(${PLUGIN_NAME} PRIVATE ${SRC})

if(TARGET clang-cpp)
    target_link_libraries(${PLUGIN_NAME} PRIVATE clang-cpp)
else()
    target_link_libraries(${PLUGIN_NAME}
        PRIVATE
        clangAST
        clangASTMatchers
        clangBasic
        clangFrontend
        clangLex
        clangRewrite
        clangTooling
    )
endif()

set_target_properties(${PLUGIN_NAME} PROPERTIES
    PREFIX ""
    ENABLE_EXPORTS OFF
)


# ============================================================
# macOS
# ============================================================

if(APPLE)
    set_target_properties(${PLUGIN_NAME} PROPERTIES
        SUFFIX ".dylib"
        LINK_FLAGS "-undefined dynamic_lookup"
    )
endif()


# ============================================================
# Tests
# ============================================================

set(TEST_NAME "Test")

add_executable(${TEST_NAME}
    tests/syntax.cpp
)

if(TARGET clang-cpp)
    target_link_libraries(${TEST_NAME}
        PRIVATE
        ${SRC}
        nlohmann_json::nlohmann_json
        clang-cpp
        LLVM
    )
else()
    target_link_libraries(${TEST_NAME}
        PRIVATE
        ${SRC}
        nlohmann_json::nlohmann_json
        clangAST
        clangASTMatchers
        clangBasic
        clangFrontend
        clangLex
        clangRewrite
        clangTooling
        LLVM
    )
endif()

add_test(
    NAME cpp_test
    COMMAND $<TARGET_FILE:${TEST_NAME}>
)

execute_process(
    COMMAND ${LLVM_TOOLS_BINARY_DIR}/clang++ -print-resource-dir
    OUTPUT_VARIABLE CLANG_RESOURCE_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)

target_compile_definitions(${TEST_NAME} PRIVATE
    CLANG_RESOURCE_DIR="${CLANG_RESOURCE_DIR}"
)
