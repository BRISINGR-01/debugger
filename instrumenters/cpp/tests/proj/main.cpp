#include <stdexcept>
#include <string>
#include <iostream>
#include "header.h"
#include <cstdint>

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

template <typename T>
struct ST
{
    T d;
};
struct STT
{
    int d;
};

// Base class to test inheritance layout
struct Base
{
    int32_t base_id;
    bool is_active; // Induces padding before derived fields
};

// Nested struct
struct Point3D
{
    float x, y, z;
};

// Complex target struct
struct ComplexTest : public Base
{
    // 1. Primitive + Alignment Padding
    double scale_factor; // Offset 8 (due to alignment after Base's 5 bytes + 3 padding)
    uint8_t flags;       // Offset 16
                         // [3 bytes padding here]
    int32_t status_code; // Offset 20

    // 2. Nested Struct & Fixed Array
    Point3D coordinates;  // Offset 24 (size 12 bytes)
    int32_t matrix[2][2]; // Offset 36 (4 * 4 = 16 bytes)

    // 3. Bit-fields (Shares bit storage space)
    uint32_t mode : 4; // Offset 52
    uint32_t priority : 4;
    uint32_t state : 8;

    // 4. Pointers & References (Address-only raw capture)
    const char *label; // Offset 56 (64-bit pointer)
    int32_t *dynamic_buffer;
};

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

void fn()
{
    printf("&");
}
#include <iostream>
#include <vector>
#include <cstring>
#include <fstream>
// ── Main ──────────────────────────────────────────────────────────────────
int main()
{
    STT st{9};
    st.d = 8;
    auto a = st;
    int i = 9;
    ComplexTest ct{
        {12, true},
        12,
        0b10101,
        9,
        {432, -312.2, 0},
        {{1, 0}, {43, 3}},
        14,
        4,
        8,
        "ptr",
        &i,
    };
    // int a = 9, b, cc = -1;
    // a++;
    // cc = 9 * (a + 1);
    // fn();
    // return 0;
    // printf("%s\n", str(9).c_str());
    // printf("%i\n", val(9));
    // printf("%i\n", val2(9));
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
