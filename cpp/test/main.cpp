/**
 * example.cpp — before instrumentation
 *
 * After running through RecorderPlugin, this file becomes
 * example.cpp.instrumented.cpp with recorder events injected.
 *
 * Compile and run:
 *   clang++ -fplugin=../src/build/Instrumenter.so \
                  -include ../src/recorder_runtime.h \
                  -std=c++17 -c main.cpp
 *   ./main.o
 */
#include <cpptrace/cpptrace.hpp>

#include <stdexcept>
#include <string>
#include <iostream>

// ── Plain function ────────────────────────────────────────────────────────
int add(int a, int b)
{
    static int i = 0;
    i++;
    int result = a + b;
    if (a == 10)
        add(1, 1);

    return result;
}

// ── Class with methods ────────────────────────────────────────────────────
class Counter
{
public:
    int value = 0;

    Counter(int start) : value(start) {}

    void increment()
    {
        value++;
    }

    int get() const
    {
        return value;
    }

    void reset()
    {
        value = 0;
    }
};

// ── Function with throw ───────────────────────────────────────────────────
int divide(int a, int b)
{
    if (b == 0)
    {
        throw std::runtime_error("division by zero");
    }
    return a / b;
}

// ── Lambda ────────────────────────────────────────────────────────────────
auto multiply = [](int x, int y)
{
    int product = x * y;
    return product;
};

// ── Main ──────────────────────────────────────────────────────────────────
int main()
{
    int x = 10, u = 10;
    int y = 20;
    y += 5;
    int z = add(x, y);

    Counter c(2);
    c.increment();
    c.increment();

    int product = multiply(c.get(), 4);

    try
    {
        int q = divide(10, 0);
    }
    catch (const std::exception &e)
    {
        // caught
        printf("%s", e.what());
    }

    auto a = cpptrace::generate_raw_trace().frames[0];
    a ;

    return 0;
}
