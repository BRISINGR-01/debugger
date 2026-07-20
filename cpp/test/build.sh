clang++ -fplugin=../src/build/Instrumenter.so \
                  -include ../src/recorder_runtime.h \
                  -std=c++17 example.cpp -o main.o;
mv example.cpp.instrumented example.cpp.instrumented.cpp;
clang++ -include ../src/recorder_runtime.h example.cpp.instrumented.cpp -o main.o;
./main.o