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
    const ASTContext &Ctx;
    Rewriter &RW;
    bool isStd(QualType QT);
    const std::string recordPrinter(const RecordDecl *RD);

public:
    std::set<std::string> customPrinterSignatures{};
    std::set<std::string> customPrinterFnImpls{};
    std::string dbgPrefix = "__dbg_";
    ValueSerializer(const ASTContext &Ctx, Rewriter &RW);

    /// Type as string that can be instrumented as code
    const std::string typeToStr(QualType QT, bool pretty = true);

    bool printerExists(const std::string objectName);
    const std::string getPrinter(QualType type);
    void registerIfPrinter(const FunctionDecl *FD);

    void constructStructPrinter(RecordDecl *RD, Rewriter &RW);
    void constructEnumPrinter(EnumDecl *ED, Rewriter &RW);
    // const std::string constructUnionPrinter(UnionDecl *ED, Rewriter &RW);

    const std::string serialize(const std::string expr, QualType type);
};
