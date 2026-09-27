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
    std::set<std::string> printerFns{};
    std::string dbgPrefix = "__dbg_";
    const ASTContext &Ctx;
    bool isStd(QualType QT);
    const std::string recordPrinter(const RecordDecl *RD);

public:
    ValueSerializer(const ASTContext &Ctx);

    /// Type as string that can be instrumented as code
    const std::string typeToStr(QualType QT);

    bool printerExists(const std::string objectName);
    const std::string getPrinter(QualType type);
    void registerIfPrinter(const FunctionDecl *FD);

    const std::string constructStructPrinter(RecordDecl *RD, Rewriter &RW);
    const std::string constructEnumPrinter(EnumDecl *ED, Rewriter &RW);
    // const std::string constructUnionPrinter(UnionDecl *ED, Rewriter &RW);

    const std::string serialize(const std::string expr, QualType type);
};
