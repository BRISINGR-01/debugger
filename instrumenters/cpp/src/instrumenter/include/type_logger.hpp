//===- QualType -> logging-source-code generator ---------===//
//
// This is a UTILITY, not an instrumenter. It does not touch the AST, does
// not insert anything into source files, and does not know where variables
// are declared or used. All it does is:
//
//   Given a clang::QualType and a source-text expression for an lvalue of
//   that type, produce a snippet of C/C++ source text that, when compiled
//   and executed at that point in the program, logs the value(s) of that
//   expression via the instrumenter_runtime.h API.
//
// Your actual instrumenter (a RecursiveASTVisitor / MatchFinder pass) is
// responsible for:
//   1. Deciding *where* to inject something (after a VarDecl, before a
//      return, at each store, etc).
//   2. Calling TypeLogger::buildLogStmt(QT, exprText, displayName) to get
//      the snippet.
//   3. Inserting that snippet at the chosen source location (via
//      clang::Rewriter or a similar text-edit mechanism).
//   4. Inserting TypeLogger::getGeneratedDecls() once near the top of the
//      translation unit (it accumulates helper dump functions for any
//      struct/class types encountered, generated lazily and only once
//      per type).
//
// Recursion is used for arrays and struct/class members; pointers are
// never dereferenced (to stay memory-safe and avoid infinite recursion on
// linked/recursive structures) -- only their address is logged, except for
// `char*`/`const char*`, which are logged as C-strings.
//
//===----------------------------------------------------------------------===//
#ifndef TYPE_LOGGER_H
#define TYPE_LOGGER_H

#include "clang/AST/ASTContext.h"
#include "clang/AST/Type.h"
#include "clang/AST/Decl.h"

#include <string>
#include <set>
#include <sstream>

class TypeLogger
{
public:
    explicit TypeLogger(clang::ASTContext &Ctx) : Ctx(Ctx) {}

    // Main entry point. `expr` is source text for an lvalue of type `QT`
    // (e.g. "x", "p->field", "arr[i]"). `displayName` is what gets printed
    // as the variable's name in the log output (usually the same as `expr`,
    // but callers may want something shorter/cleaner).
    //
    // Returns a self-contained, semicolon-terminated statement (wrapped in
    // its own { } block), safe to insert as a standalone statement anywhere
    // a statement is legal.
    std::string buildLogStmt(clang::QualType QT, const std::string &expr,
                             const std::string &displayName);

    // Accumulated source text for helper struct/class dump functions
    // generated so far (across all buildLogStmt calls on this TypeLogger
    // instance). Insert this once, near the top of the file, *after* the
    // #include for instrumenter_runtime.h and after the type definitions it
    // depends on are visible (simplest: emit it right before main()/at the
    // point of first use, or in a separate generated header included after
    // all user headers).
    const std::string &getGeneratedDecls() const { return GeneratedDecls; }

    void reset()
    {
        GeneratedDecls.clear();
        EmittedRecordDumpers.clear();
        UniqueCounter = 0;
    }

private:
    clang::ASTContext &Ctx;
    std::string GeneratedDecls;
    std::set<std::string> EmittedRecordDumpers; // canonical type name -> already generated
    int UniqueCounter = 0;
    static const int kMaxRecursionDepth = 12; // guard against pathological nesting

    std::string dispatch(clang::QualType QT, const std::string &expr,
                         const std::string &name, int depth);

    std::string handleBuiltin(const clang::BuiltinType *BT,
                              const std::string &expr, const std::string &name);
    std::string handlePointer(clang::QualType QT, const std::string &expr,
                              const std::string &name);
    std::string handleEnum(clang::QualType QT, const std::string &expr,
                           const std::string &name);
    std::string handleConstantArray(clang::QualType QT, const std::string &expr,
                                    const std::string &name, int depth);
    std::string handleRecord(clang::QualType QT, const std::string &expr,
                             const std::string &name, int depth);
    std::string handleFallbackRaw(clang::QualType QT, const std::string &expr,
                                  const std::string &name);

    // Ensures a __dump_struct_<X>(const char*, const T*) function exists in
    // GeneratedDecls for the record type QT (generating it, recursively via
    // dispatch(), if this is the first time we've seen it). Returns the
    // function name to call.
    std::string ensureRecordDumper(clang::QualType QT, int depth);

    // Appends "  <field-log-stmt>\n" lines to `out` for every field of RD,
    // accessed through `basePtrExpr->field`. Anonymous struct/union members
    // are flattened (their sub-fields are accessed directly through
    // basePtrExpr, matching C/C++ semantics for anonymous members).
    void emitRecordFieldsInto(const clang::RecordDecl *RD,
                              const std::string &basePtrExpr, int depth,
                              std::ostringstream &out);

    std::string sanitizeIdentifier(const std::string &s);
    std::string uniqueSuffix();
};

#endif // TYPE_LOGGER_H