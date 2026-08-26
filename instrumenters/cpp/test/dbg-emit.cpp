#include "string"
#include "iostream"
#include "fstream"

void __dbg_emit(const std::string data)
{
    std::ofstream out;
    out.open("/home/alex/Desktop/VSC/debugger/instrumenters/cpp/test/.debug/.dbg-socket", std::ios::app);

    out << data << "\n";
    out.close();
}