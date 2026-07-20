cmake_minimum_required(VERSION 3.16)
project(Instrumenter C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ── Find LLVM / Clang ─────────────────────────────────────────────────────────
# Typical search paths (override with -DLLVM_DIR=... / -DClang_DIR=...):
#   Ubuntu apt: /usr/lib/llvm-17/lib/cmake/llvm
#   Homebrew  : /opt/homebrew/opt/llvm/lib/cmake/llvm
find_package(LLVM  REQUIRED CONFIG)
find_package(Clang REQUIRED CONFIG)

message(STATUS "Found LLVM  ${LLVM_PACKAGE_VERSION}  →  ${LLVM_DIR}")
message(STATUS "Found Clang headers in ${CLANG_INCLUDE_DIRS}")

include_directories(
    SYSTEM
    ${LLVM_INCLUDE_DIRS}
    ${CLANG_INCLUDE_DIRS}
)
add_definitions(${LLVM_DEFINITIONS})

# ── Instrumenter plugin shared library ───────────────────────────────────────
# The plugin is dlopen'd by the host clang process, so all Clang/LLVM symbols
# must be resolved at runtime from the host, not linked statically.
add_library(Instrumenter MODULE instrumenter.cpp)

# clang-cpp provides all Clang libraries in a single convenient shared lib
# (available since LLVM 10). Falls back to individual libs if needed.
if (TARGET clang-cpp)
    target_link_libraries(Instrumenter PRIVATE clang-cpp)
else()
    # Older distributions may only have split libraries
    target_link_libraries(Instrumenter PRIVATE
        clangAST
        clangASTMatchers
        clangBasic
        clangFrontend
        clangLex
        clangRewrite
        clangTooling
    )
endif()

set_target_properties(Instrumenter PROPERTIES
    PREFIX ""          # Instrumenter.so, not libInstrumenter.so
    ENABLE_EXPORTS OFF # don't export our own symbols into the host
)

# macOS: symbols that are provided by the host clang binary at dlopen time
if (APPLE)
    set_target_properties(Instrumenter PROPERTIES
        SUFFIX ".dylib"
        LINK_FLAGS "-undefined dynamic_lookup"
    )
endif()

# ── Demo: compile example.cpp without the plugin (produces example_plain) ─────
add_custom_target(demo_plain
    COMMAND ${CMAKE_CXX_COMPILER}
            -include ${CMAKE_SOURCE_DIR}/recorder_runtime.h
            -std=c++17
            ${CMAKE_SOURCE_DIR}/example.cpp
            -o ${CMAKE_BINARY_DIR}/example_plain
    COMMENT "Building example.cpp WITHOUT instrumentation"
)

# ── Demo: compile example.cpp WITH the plugin (produces example_instrumented) ─
add_custom_target(demo_instrumented
    COMMAND ${CMAKE_CXX_COMPILER}
            -fplugin=$<TARGET_FILE:Instrumenter>
            -include ${CMAKE_SOURCE_DIR}/recorder_runtime.h
            -std=c++17
            ${CMAKE_SOURCE_DIR}/example.cpp
            -o ${CMAKE_BINARY_DIR}/example_instrumented
    DEPENDS Instrumenter
    COMMENT "Building example.cpp WITH instrumentation plugin"
)

# ── Demo: run the instrumented binary ─────────────────────────────────────────
add_custom_target(run_demo
    COMMAND ${CMAKE_BINARY_DIR}/example_instrumented
    DEPENDS demo_instrumented
    COMMENT "Running instrumented example"
)

# ── Emit instrumented source text (AST rewrite only, no compile) ──────────────
add_custom_target(emit_rewritten
    COMMAND ${CMAKE_CXX_COMPILER}
            -fplugin=$<TARGET_FILE:Instrumenter>
            -include ${CMAKE_SOURCE_DIR}/recorder_runtime.h
            -std=c++17
            -fsyntax-only
            ${CMAKE_SOURCE_DIR}/example.cpp
    DEPENDS Instrumenter
    COMMENT "Running instrumenter on example.cpp (rewrites to example.cpp.instrumented)"
)

# ── Install ───────────────────────────────────────────────────────────────────
install(TARGETS Instrumenter DESTINATION lib)
install(FILES recorder_runtime.h DESTINATION include)