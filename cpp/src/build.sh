cmake -B build -DLLVM_DIR=$(llvm-config --cmakedir)
cd build
make