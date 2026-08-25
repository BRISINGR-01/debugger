clang++ -fplugin=../src/build/Instrumenter.so \
                  -std=c++20 example.cpp -o main.o && 
mv example.cpp.instrumented example.cpp.instrumented.cpp &&
clang++ example.cpp.instrumented.cpp -o main.o &&
./main.o