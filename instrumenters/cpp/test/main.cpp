/**
 * example.cpp — before instrumentation
 *
 * After running through RecorderPlugin, this file becomes
 * example.cpp.instrumented.cpp with recorder events injected.
 *
 * Compile and run:
 *   clang++ -fplugin=../src/build/Instrumenter.so \
                  -include ../src/recorder_runtime.h \
                  -std=c++20 -c main.cpp
 *   ./main.o
 */
#include <stdexcept>
#include <string>
#include <iostream>
#include "header.h"

// ── Plain function ────────────────────────────────────────────────────────
int add(int a, int b)
{
    static int i = 0;
    i++;
    int result = a + b;
    if (a == 10)
        return add(1, 1);

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

int val(int);
int val2(int);

const std::string str(int n)
{
    return "n";
}

// ── Main ──────────────────────────────────────────────────────────────────
int main()
{
    printf("%s\n", str(9).c_str());
    printf("%i\n", val(9));
    return 0;
    printf("%i\n", val2(9));
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

    return 0;
}
