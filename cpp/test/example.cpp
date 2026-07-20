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
// #include "../src/recorder_runtime.h"

// ── Simple arithmetic ─────────────────────────────────────────────────────────
int add(int a, int b)
{
    int result = a + b;
    return result;
}

double average(const std::vector<double> &values)
{
    if (bool mpty = values.empty())
        return 0.0;

    double sum = 0.0;
    for (double v : values)
    {
        sum = sum + v;
    }
    return sum / static_cast<double>(values.size());
}

// ── Exception demo ────────────────────────────────────────────────────────────
int safe_divide(int numerator, int denominator)
{
    if (denominator == 0)
    {
        throw std::invalid_argument("division by zero");
    }
    int result = numerator / denominator;
    return result;
}

int divide_with_catch(int a, int b)
{
    int result = 0;
    try
    {
        result = safe_divide(a, b);
    }
    catch (const std::invalid_argument &ex)
    {
        std::cerr << "Caught: " << ex.what() << "\n";
        result = -1;
    }
    return result;
}

// ── Branching ─────────────────────────────────────────────────────────────────
std::string classify(int n)
{
    std::string label;
    if (n < 0)
    {
        label = "negative";
    }
    else if (n == 0)
    {
        label = "zero";
    }
    else
    {
        label = "positive";
    }
    return label;
}

// ── Mutation / assignment chains ──────────────────────────────────────────────
int accumulate(int start, int count)
{
    int acc = start;
    for (int i = 0; i < count; ++i)
    {
        acc = acc + i;
    }
    return acc;
}

// ── Fibonacci (recursive) ─────────────────────────────────────────────────────
long long fib(int n)
{
    if (n <= 1)
        return static_cast<long long>(n);
    return fib(n - 1) + fib(n - 2);
}

// ── Nested functions / void return ────────────────────────────────────────────
void log_value(const char *name, int val)
{
}

void process(int x)
{
    int doubled = x * 2;
    log_value("doubled", doubled);
    if (doubled > 100)
    {
        return; // early void return
    }
    int tripled = x * 3;
    log_value("tripled", tripled);
}

// ── main ─────────────────────────────────────────────────────────────────────
int main()
{
    // Silence live stderr printing so the demo output is readable
    // __recorder__.set_stderr_enabled(false);

    int s = add(3, 4);

    std::vector<double> nums = {1.0, 2.0, 3.0, 4.0, 5.0};
    double avg = average(nums);

    int d1 = divide_with_catch(10, 2);
    int d2 = divide_with_catch(10, 0);

    process(40);
    process(60);

    accumulate(1, 4);
    // ── Dump the recorded history ─────────────────────────────────────────────
    // std::cout << "\n──── Recorded History (" << __recorder__.snapshot().size()
    //           << " events) ────\n";
    // __recorder__.dump_history(std::cout);

    return 0;
}