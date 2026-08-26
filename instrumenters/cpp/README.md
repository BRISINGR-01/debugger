# CPP Instrumenter

### Dependencies
- clang 22.1.8

### Running
```sh
clang++ -std=c++20  -o /dev/null
     -fplugin=./src/build/Instrumenter.so
     -fplugin-arg-instrumenter-<path to root>/.debug
     <list of files>
```

If it is a single file without a _main_ (and a main is needed) function add `-c`.

### Communication
file

### Files 
- .c
- .cpp
- .h
- .hpp

## Future notes
- use bear todetermine in which put implementation of debugger. ex: (keep track of used command) first time put implementation in every file as now, let bear detect files, then be selective.