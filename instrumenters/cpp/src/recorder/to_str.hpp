#include <stdio.h>
#include <string.h>

#ifdef __cplusplus
#include <string>
#include <sstream>
#include <cstdint>

namespace dbgrt {

inline std::string to_dbg_str(int v)          { return std::to_string(v); }
inline std::string to_dbg_str(unsigned v)      { return std::to_string(v); }
inline std::string to_dbg_str(long v)          { return std::to_string(v); }
inline std::string to_dbg_str(double v)        { return std::to_string(v); }
inline std::string to_dbg_str(float v)         { return std::to_string(v); }
inline std::string to_dbg_str(bool v)          { return v ? "true" : "false"; }
inline std::string to_dbg_str(const char* v)   { return v ? (std::string("\"")+v+"\"") : "null"; }

template <typename T>
inline std::string to_dbg_str(T* v) {
    char buf[20]; snprintf(buf, sizeof(buf), "0x%llx", (unsigned long long)(uintptr_t)v);
    return buf;
}

// generic opaque fallback (worse match than any generated overload/method)
template <typename T>
inline std::string to_dbg_str(const T& v) {
    const unsigned char* p = reinterpret_cast<const unsigned char*>(&v);
    std::ostringstream os; os << "<opaque:" << sizeof(T) << " bytes:";
    for (size_t i = 0; i < sizeof(T); ++i) { char b[3]; snprintf(b,sizeof(b),"%02x",p[i]); os<<b; }
    os << ">";
    return os.str();
}

inline void append_field(std::ostringstream& os, bool& first, const char* name, const std::string& val) {
    if (!first) os << ", ";
    first = false;
    os << name << "=" << val;
}

} // namespace dbgrt
#endif // __cplusplus

// C-callable entry point used for BOTH plain C structs and (via the wrapper
// generated below) C++ classes, so __var_decl()'s call site can stay
// language-agnostic if you want a single macro path.
#ifdef __cplusplus
extern "C" {
#endif
void dbgrt_raw_hex_dump(const void* p, size_t n, char* out, size_t outcap); // fallback, opaque bytes
#ifdef __cplusplus
}
#endif