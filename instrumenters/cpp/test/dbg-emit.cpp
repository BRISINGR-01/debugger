#include "string"

void __dbg_emit(const std::string data)
{
    printf("%s\n", data.c_str());
}