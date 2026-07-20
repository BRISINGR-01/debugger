// test_runtime.cpp
// ============================================================================
//  Simulates what the instrumentation plugin emits, so you can test the
//  recorder_runtime.h header without building the LLVM plugin.
//
//  Compile & run:
//      clang++ -std=c++17 -include ../src/recorder_runtime.h test_runtime.cpp -o test_runtime
//      ./test_runtime
//  or
//      g++ -std=c++17 -include ../src/recorder_runtime.h test_runtime.cpp -o test_runtime
//      ./test_runtime

#include "../src/recorder.h"

int main()
{
    __recorder__.func_enter("main", "", 0, {});
}