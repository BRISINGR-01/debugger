// example.cpp  —  exercised by the instrumenter plugin
// ============================================================================
//  Compile (after building the plugin):
//
//    clang++ -fplugin=./build/Instrumenter.so \
//            -include recorder_runtime.h \
//            -std=c++17 -c example.cpp -o example.o
//
//  Or run the full demo:
//
//    clang++ -fplugin=./build/Instrumenter.so \
//            -include recorder_runtime.h \
//            -std=c++17 example.cpp -o example_demo
//    ./example_demo
// ============================================================================
#include <stdexcept>
#include <string>
#include <vector>
#include <iostream>
// #include "../src/recorder_runtime.h"

// ── Simple arithmetic ─────────────────────────────────────────────────────────
int add(int a, int b)
{  FuncScopeGuard __rsg__("add", "example.cpp:24", 24);
  __recorder__.func_enter("add", "example.cpp:24", 24,
    std::vector<ArgInfo>{
      ArgInfo{"a", ValueSnapshot::from(a, "int")},
      ArgInfo{"b", ValueSnapshot::from(b, "int")}
    });

    int result = a + b; __recorder__.var_decl("add", "example.cpp:25", 25, "result", result, "int");

    { auto __ret_val__ = (result);
  __recorder__.func_return("add", "example.cpp:26", 26, __ret_val__, "int");
  __rsg__.returned = true; 
  return __ret_val__; };
}

double average(const std::vector<double> &values)
{  FuncScopeGuard __rsg__("average", "example.cpp:30", 30);
  __recorder__.func_enter("average", "example.cpp:30", 30,
    std::vector<ArgInfo>{
      ArgInfo{"values", ValueSnapshot::from(values, "const std::vector<double> &")}
    });

    if (bool mpty = values.empty())
        {  __recorder__.var_decl("average", "example.cpp:31", 31, "mpty", mpty, "_Bool");
 __recorder__.branch_taken("average", "example.cpp:31", 31, "then");
{ auto __ret_val__ = (0.0);
  __recorder__.func_return("average", "example.cpp:32", 32, __ret_val__, "double");
  __rsg__.returned = true; 
  return __ret_val__; } };

    double sum = 0.0; __recorder__.var_decl("average", "example.cpp:34", 34, "sum", sum, "double");

    for (double v : values)
    { __recorder__.loop_iter("average", "example.cpp:35", 35, "for");
 __recorder__.var_decl("average", "example.cpp:35", 35, "v", v, "double");

        sum = sum + v;
  /* [recorder] var_change: sum */
  if (true) { __recorder__.var_change("average", "example.cpp:37", 37, "sum", sum, "double"); }

    }
    { auto __ret_val__ = (sum / static_cast<double>(values.size()));
  __recorder__.func_return("average", "example.cpp:39", 39, __ret_val__, "double");
  __rsg__.returned = true; 
  return __ret_val__; };
}

// ── Exception demo ────────────────────────────────────────────────────────────
int safe_divide(int numerator, int denominator)
{  FuncScopeGuard __rsg__("safe_divide", "example.cpp:44", 44);
  __recorder__.func_enter("safe_divide", "example.cpp:44", 44,
    std::vector<ArgInfo>{
      ArgInfo{"numerator", ValueSnapshot::from(numerator, "int")},
      ArgInfo{"denominator", ValueSnapshot::from(denominator, "int")}
    });

    if (denominator == 0)
    { __recorder__.branch_taken("safe_divide", "example.cpp:45", 45, "then");

        (__recorder__.throw_site("safe_divide", "example.cpp:47", 47, "std::invalid_argument"), throw std::invalid_argument("division by zero"));
    }
    int result = numerator / denominator; __recorder__.var_decl("safe_divide", "example.cpp:49", 49, "result", result, "int");

    { auto __ret_val__ = (result);
  __recorder__.func_return("safe_divide", "example.cpp:50", 50, __ret_val__, "int");
  __rsg__.returned = true; 
  return __ret_val__; };
}

int divide_with_catch(int a, int b)
{  FuncScopeGuard __rsg__("divide_with_catch", "example.cpp:54", 54);
  __recorder__.func_enter("divide_with_catch", "example.cpp:54", 54,
    std::vector<ArgInfo>{
      ArgInfo{"a", ValueSnapshot::from(a, "int")},
      ArgInfo{"b", ValueSnapshot::from(b, "int")}
    });

    int result = 0; __recorder__.var_decl("divide_with_catch", "example.cpp:55", 55, "result", result, "int");

    try
    {
  /* [recorder] try_enter */
  __recorder__.try_enter("divide_with_catch", "example.cpp:56", 56);

        result = safe_divide(a, b);
  /* [recorder] var_change: result */
  if (true) { __recorder__.var_change("divide_with_catch", "example.cpp:58", 58, "result", result, "int"); }

    }
    catch (const std::invalid_argument &ex)
    {
  /* [recorder] catch_enter */
  __recorder__.catch_enter("divide_with_catch", "example.cpp:60", 60, "const std::invalid_argument &" /* ex: ex */);

        std::cerr << "Caught: " << ex.what() << "\n";
        result = -1;
  /* [recorder] var_change: result */
  if (true) { __recorder__.var_change("divide_with_catch", "example.cpp:63", 63, "result", result, "int"); }

    
  /* [recorder] catch_exit */
  __recorder__.catch_exit("divide_with_catch", "example.cpp:60", 60);
}
    { auto __ret_val__ = (result);
  __recorder__.func_return("divide_with_catch", "example.cpp:65", 65, __ret_val__, "int");
  __rsg__.returned = true; 
  return __ret_val__; };
}

// ── Branching ─────────────────────────────────────────────────────────────────
std::string classify(int n)
{  FuncScopeGuard __rsg__("classify", "example.cpp:70", 70);
  __recorder__.func_enter("classify", "example.cpp:70", 70,
    std::vector<ArgInfo>{
      ArgInfo{"n", ValueSnapshot::from(n, "int")}
    });

    std::string label; __recorder__.var_decl("classify", "example.cpp:71", 71, "label", label, "std::string");

    if (n < 0)
    { __recorder__.branch_taken("classify", "example.cpp:72", 72, "then");

        label = "negative";
    }
    else {  __recorder__.branch_taken("classify", "example.cpp:72", 72, "else");
if (n == 0)
    { __recorder__.branch_taken("classify", "example.cpp:76", 76, "then");

        label = "zero";
    }
    else
    { __recorder__.branch_taken("classify", "example.cpp:76", 76, "else");

        label = "positive";
    } }
    { auto __ret_val__ = (label);
  __recorder__.func_return("classify", "example.cpp:84", 84, __ret_val__, "std::string");
  __rsg__.returned = true; 
  return __ret_val__; };
}

// ── Mutation / assignment chains ──────────────────────────────────────────────
int accumulate(int start, int count)
{  FuncScopeGuard __rsg__("accumulate", "example.cpp:89", 89);
  __recorder__.func_enter("accumulate", "example.cpp:89", 89,
    std::vector<ArgInfo>{
      ArgInfo{"start", ValueSnapshot::from(start, "int")},
      ArgInfo{"count", ValueSnapshot::from(count, "int")}
    });

    int acc = start; __recorder__.var_decl("accumulate", "example.cpp:90", 90, "acc", acc, "int");

    for (int i = 0; i < count; ++i)
    { __recorder__.loop_iter("accumulate", "example.cpp:91", 91, "for");
 __recorder__.var_decl("accumulate", "example.cpp:91", 91, "i", i, "int");

        acc = acc + i;
  /* [recorder] var_change: acc */
  if (true) { __recorder__.var_change("accumulate", "example.cpp:93", 93, "acc", acc, "int"); }

    }
    { auto __ret_val__ = (acc);
  __recorder__.func_return("accumulate", "example.cpp:95", 95, __ret_val__, "int");
  __rsg__.returned = true; 
  return __ret_val__; };
}

// ── Fibonacci (recursive) ─────────────────────────────────────────────────────
long long fib(int n)
{  FuncScopeGuard __rsg__("fib", "example.cpp:100", 100);
  __recorder__.func_enter("fib", "example.cpp:100", 100,
    std::vector<ArgInfo>{
      ArgInfo{"n", ValueSnapshot::from(n, "int")}
    });

    if (n <= 1)
        {  __recorder__.branch_taken("fib", "example.cpp:101", 101, "then");
{ auto __ret_val__ = (static_cast<long long>(n));
  __recorder__.func_return("fib", "example.cpp:102", 102, __ret_val__, "long long");
  __rsg__.returned = true; 
  return __ret_val__; } };
    { auto __ret_val__ = (fib(n - 1) + fib(n - 2));
  __recorder__.func_return("fib", "example.cpp:103", 103, __ret_val__, "long long");
  __rsg__.returned = true; 
  return __ret_val__; };
}

// ── Nested functions / void return ────────────────────────────────────────────
void log_value(const char *name, int val)
{  FuncScopeGuard __rsg__("log_value", "example.cpp:108", 108);
  __recorder__.func_enter("log_value", "example.cpp:108", 108,
    std::vector<ArgInfo>{
      ArgInfo{"name", ValueSnapshot::from(name, "const char *")},
      ArgInfo{"val", ValueSnapshot::from(val, "int")}
    });

}

void process(int x)
{  FuncScopeGuard __rsg__("process", "example.cpp:112", 112);
  __recorder__.func_enter("process", "example.cpp:112", 112,
    std::vector<ArgInfo>{
      ArgInfo{"x", ValueSnapshot::from(x, "int")}
    });

    int doubled = x * 2; __recorder__.var_decl("process", "example.cpp:113", 113, "doubled", doubled, "int");

    log_value("doubled", doubled);
    if (doubled > 100)
    { __recorder__.branch_taken("process", "example.cpp:115", 115, "then");

        { __recorder__.func_return_void("process", "example.cpp:117", 117);
  __rsg__.returned = true;  return; }; // early void return
    }
    int tripled = x * 3; __recorder__.var_decl("process", "example.cpp:119", 119, "tripled", tripled, "int");

    log_value("tripled", tripled);
}

// ── main ─────────────────────────────────────────────────────────────────────
int main()
{  FuncScopeGuard __rsg__("main", "example.cpp:125", 125);
  __recorder__.func_enter("main", "example.cpp:125", 125);


    // int s = add(3, 4);

    // std::vector<double> nums = {1.0, 2.0, 3.0, 4.0, 5.0};
    // double avg = average(nums);

    // int d1 = divide_with_catch(10, 2);
    // int d2 = divide_with_catch(10, 0);

    // process(40);
    // process(60);

    // accumulate(1, 4);

    if (int v = 0)
    { __recorder__.var_decl("main", "example.cpp:140", 140, "v", v, "int");
 __recorder__.branch_taken("main", "example.cpp:140", 140, "then");

        std::cout << "2" << std::endl;
    }
    else {  __recorder__.var_decl("main", "example.cpp:140", 140, "v", v, "int");
 __recorder__.branch_taken("main", "example.cpp:140", 140, "else");
if (bool d = false)
    { __recorder__.var_decl("main", "example.cpp:144", 144, "d", d, "_Bool");
 __recorder__.branch_taken("main", "example.cpp:144", 144, "then");

        std::cout << "1" << std::endl;
    }
    else
    { __recorder__.var_decl("main", "example.cpp:144", 144, "d", d, "_Bool");
 __recorder__.branch_taken("main", "example.cpp:144", 144, "else");

        std::cout << "0" << std::endl;
    } }

    { auto __ret_val__ = (0);
  __recorder__.func_return("main", "example.cpp:153", 153, __ret_val__, "int");
  __rsg__.returned = true; 
  return __ret_val__; };
}