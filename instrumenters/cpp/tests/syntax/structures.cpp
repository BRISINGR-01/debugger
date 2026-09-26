#include <stdexcept>
#include <string>
#include <iostream>
#include <cstdint>
#include <nlohmann/json.hpp>
using json = nlohmann::json;

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
#include <iostream>
#include <vector>
#include <cstring>
#include <fstream>
// Injected runtime function
extern "C" void __instrument_capture_struct(const void *ptr, size_t size, const char *struct_id)
{
    if (!ptr)
        return;

    std::vector<uint8_t> buffer(size);
    std::memcpy(buffer.data(), ptr, size);

    // Persist raw memory buffer alongside the schema identifier
    std::ofstream out(std::string(struct_id) + ".bin", std::ios::binary);
    out.write(reinterpret_cast<const char *>(buffer.data()), size);
}
// ── Main ──────────────────────────────────────────────────────────────────
int main()
{
    json obj = {
        {"k", "v"},
    };
    __instrument_capture_struct(&obj, sizeof(obj), "json");

    STT st{9};
    // __instrument_capture_struct(&st, sizeof(st), "1s");
    st.d = 8;
    // __instrument_capture_struct(&st, sizeof(st), "2s");
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
    // __instrument_capture_struct(&ct, sizeof(ct), "ct");

    Counter c(2);
    c.increment();
    c.increment();
    // __instrument_capture_struct(&c, sizeof(c), "c");
}
