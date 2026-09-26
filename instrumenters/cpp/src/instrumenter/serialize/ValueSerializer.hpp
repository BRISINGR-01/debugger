#pragma once

#include <functional>
#include <string>
#include <set>
#include "clang/AST/ASTContext.h"
#include "clang/Rewrite/Core/Rewriter.h"
#include "clang/AST/Type.h"

using namespace clang;

#define MAX_DEPTH 4

class ValueSerializer
{
private:
    std::set<std::string> objectsWithPrinter{};
    std::string dbgToken = "__dbg";
    bool isC = true;
    const ASTContext &Ctx;

public:
    ValueSerializer(const ASTContext &Ctx, bool isC);

    /// Type as string that can be instrumented as code
    const std::string sanitizeType(clang::QualType QT);
    const std::string typeToStr(QualType QT);

    /// Emit C89-safe code (tag keywords on record types, no references, no
    /// taking the address of rvalues). Auto-detected from LangOpts if you use
    /// makeOptionsFor(Ctx).
    bool hasPrinter(const std::string &objectName);

    const std::string constructStructPrinter(RecordDecl *RD, Rewriter &RW);
    const std::string constructEnumPrinter(EnumDecl *ED, Rewriter &RW);
    // const std::string constructUnionPrinter(UnionDecl *ED, Rewriter &RW);

    const std::string serialize(const std::string expr, QualType type);
};
