// example.cpp  —  exercised by the instrumenter plugin
// ============================================================================
//  Compile (after building the plugin):
//
//    clang++ -fplugin=./build/Instrumenter.so \
//            -include recorder_runtime.h \
//            -std=c++17 -c example.cpp -o example.o
//
//  Or run the full demo:
//
//    clang++ -fplugin=./build/Instrumenter.so \
//            -include recorder_runtime.h \
//            -std=c++17 example.cpp -o example_demo
//    ./example_demo
// ============================================================================
#include <stdexcept>
#include <string>
#include <vector>
#include <iostream>
#include "header.h"

int c()
{
    return 9;
}

int main2()
{
    int c = 9;
    c++;
    return add(c, 1);
}