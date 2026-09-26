#include <clang/AST/ASTContext.h>
#include <clang/AST/RecursiveASTVisitor.h>
#include <clang/Frontend/ASTConsumers.h>
#include <clang/Frontend/CompilerInstance.h>
#include <clang/Tooling/Tooling.h>

#include <iostream>
#include <string>
#include <string_view>
#include <vector>

#include "../src/instrumenter/serialize/ValueSerializer.hpp"
#include "../src/instrumenter/include/utils.hpp"

using namespace clang;
using namespace clang::tooling;

#ifndef CLANG_RESOURCE_DIR
#define CLANG_RESOURCE_DIR
#endif

// -----------------------------------------------------------------------------
// Test cases
// -----------------------------------------------------------------------------

struct TestCase
{
  const char *expression;
  const char *expected;
};

static constexpr TestCase tests[] = {

    // Builtins
    {"b", "bool"},
    {"c", "char"},
    {"sc", "signed char"},
    {"uc", "unsigned char"},

    {"s", "short"},
    {"us", "unsigned short"},
    {"i", "int"},
    {"ui", "unsigned int"},
    {"l", "long"},
    {"ul", "unsigned long"},
    {"ll", "long long"},
    {"ull", "unsigned long long"},

    {"f", "float"},
    {"d", "double"},
    {"ld", "long double"},

    {"wc", "wchar_t"},
    {"c8", "char8_t"},
    {"c16", "char16_t"},
    {"c32", "char32_t"},

    // Expressions
    {"i + i", "int"},
    {"i + d", "double"},
    {"-i", "int"},
    {"!b", "bool"},
    {"i == ui", "bool"},
    {"i < d", "bool"},

    // Pointers
    {"pi", "int *"},
    {"&i", "int *"},
    {"*pi", "int"},

    // References
    {"ri", "int"},
    {"cri", "const int"},

    // Arrays
    {"arr", "int *"},
    {"arr[0]", "int"},
    {"&arr", "int (*)[4]"},

    // STL
    {"str", "std::string"},
    {"vec", "std::vector<int>"},
    {"vecvec", "std::vector<std::vector<int>>"},
    {"deq", "std::deque<double>"},
    {"lst", "std::list<int>"},
    {"arrStd", "std::array<int, 4>"},

    {"set", "std::set<int>"},
    {"uset", "std::unordered_set<int>"},
    {"map", "std::map<int, std::string>"},
    {"umap", "std::unordered_map<int, std::string>"},

    {"pair", "std::pair<int, double>"},
    {"tuple", "std::tuple<int, double, std::string>"},

    {"opt", "std::optional<int>"},
    {"var", "std::variant<int, double>"},
    {"any", "std::any"},

    {"unique", "std::unique_ptr<int>"},
    {"shared", "std::shared_ptr<int>"},

    // User types
    {"simple", "Simple"},
    {"simple.x", "int"},

    {"object", "MyClass"},
    {"object.x", "int"},

    {"uni", "MyUnion"},
    {"uni.i", "int"},

    {"color", "Color"},

    // Aliases
    {"aliasInt", "int"},
    {"aliasVector", "std::vector<int>"},

    // Nested user types
    {"nested", "Nested"},
    {"nested.simple", "Simple"},
    {"nested.simple.x", "int"},
};

// -----------------------------------------------------------------------------
// Source
// -----------------------------------------------------------------------------

static constexpr const char *source = R"cpp(

#include <string>
#include <vector>
#include <deque>
#include <list>
#include <array>
#include <set>
#include <unordered_set>
#include <map>
#include <unordered_map>
#include <tuple>
#include <utility>
#include <optional>
#include <variant>
#include <any>
#include <memory>

struct Simple {
    int x;
    double y;
};

struct Nested {
    Simple simple;
};

class MyClass {
public:
    int x;
};

union MyUnion {
    int i;
    double d;
};

enum class Color {
    Red,
    Green
};

using MyInt = int;
using IntVector = std::vector<int>;

bool b;
char c;
signed char sc;
unsigned char uc;

short s;
unsigned short us;
int i;
unsigned int ui;
long l;
unsigned long ul;
long long ll;
unsigned long long ull;

float f = 2 * 2.2;
double d;
long double ld;

wchar_t wc;
char8_t c8;
char16_t c16;
char32_t c32;

int* pi;

int& ri = i;
const int& cri = i;

int arr[4];

std::string str;
std::vector<int> vec;
std::vector<std::vector<int>> vecvec;
std::deque<double> deq;
std::list<int> lst;
std::array<int, 4> arrStd;

std::set<int> set;
std::unordered_set<int> uset;
std::map<int, std::string> map;
std::unordered_map<int, std::string> umap;

std::pair<int, double> pair;
std::tuple<int, double, std::string> tuple;

std::optional<int> opt;
std::variant<int, double> var;
std::any any;

std::unique_ptr<int> unique;
std::shared_ptr<int> shared;

Simple simple;
MyClass object;
MyUnion uni;
Color color;

MyInt aliasInt;
IntVector aliasVector;

Nested nested;

)cpp";

// -----------------------------------------------------------------------------
// Visitor
// -----------------------------------------------------------------------------

class Visitor : public RecursiveASTVisitor<Visitor>
{
public:
  Visitor(ASTContext &context)
      : context_(context), serializer(ValueSerializer(context, false)), SM(context.getSourceManager()), LO(context.getLangOpts())
  {
  }

  bool VisitVarDecl(VarDecl *decl)
  {

    std::string name = decl->getDeclName().getAsString();
    for (const auto &test : tests)
    {
      if (name == test.expression)
      {
        QualType t = decl->getType();
        std::cout << "VisitVarDecl: " << name << std::endl;
        std::cout << t.getAsString() << std::endl;
        // runTest(test, expr);
      }
    }

    return true;
  }
  bool VisitDeclRefExpr(DeclRefExpr *expr)
  {
    std::string name = expr->getNameInfo().getAsString();
    std::cout << "VisitDeclRefExpr: " << name << std::endl;
    // Only useful for expressions that are simple identifiers.
    for (const auto &test : tests)
    {
      if (name == test.expression)
      {
        runTest(test, expr);
      }
    }

    return true;
  }

private:
  ASTContext &context_;
  ValueSerializer serializer;
  SourceManager &SM;
  const LangOptions &LO;

  void runTest(const TestCase &test, Expr *expr)
  {
    QualType type = expr->getType();

    std::string actual = serializer.serialize(test.expression, type);

    bool ok = actual == test.expected;

    std::cout
        << (ok ? "[PASS] " : "[FAIL] ")
        << test.expression
        << "\n";

    if (!ok)
    {
      std::cout
          << "       expected: " << test.expected << "\n"
          << "       actual:   " << actual << "\n"
          << "       clang:    " << type.getAsString() << "\n";
    }
  }
};

// -----------------------------------------------------------------------------
// AST consumer
// -----------------------------------------------------------------------------

class Consumer : public ASTConsumer
{
public:
  explicit Consumer(ASTContext &context)
      : context_(context)
  {
  }

  void HandleTranslationUnit(ASTContext &context) override
  {
    Visitor visitor(context);
    visitor.TraverseDecl(context.getTranslationUnitDecl());
  }

private:
  ASTContext &context_;
};

// -----------------------------------------------------------------------------
// Frontend action
// -----------------------------------------------------------------------------

class Action : public ASTFrontendAction
{
public:
  std::unique_ptr<ASTConsumer>
  CreateASTConsumer(
      CompilerInstance &compiler,
      llvm::StringRef)
      override
  {
    return std::make_unique<Consumer>(
        compiler.getASTContext());
  }
};

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------

int main()
{
  std::vector<std::string> args = {
      "-std=c++20",
      "-resource-dir",
      CLANG_RESOURCE_DIR};

  bool success = runToolOnCodeWithArgs(
      std::make_unique<Action>(),
      source,
      args,
      "test.cpp");

  return success ? 0 : 1;
}