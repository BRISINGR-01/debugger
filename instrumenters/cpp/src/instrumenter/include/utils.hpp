#pragma once

#include "clang/AST/ASTConsumer.h"
#include "clang/AST/RecursiveASTVisitor.h"
#include "clang/Frontend/CompilerInstance.h"
#include "clang/Frontend/FrontendPluginRegistry.h"
#include "clang/Rewrite/Core/Rewriter.h"
#include "clang/Lex/Lexer.h"
#include "clang/Basic/SourceManager.h"
#include "clang/Basic/FileManager.h"
#include "llvm/Support/raw_ostream.h"

#include <iostream>
#include <set>
#include <sstream>
#include <optional>
#include <string>
#include <filesystem>
#include <vector>

#include "./utils.hpp"

using namespace clang;

struct Loc
{
    struct
    {
        u_int line;
        u_int col;
    } start;
    struct
    {
        u_int line;
        u_int col;
    } end;
};

std::string escape(std::string s);

std::string typeStr(QualType qt, const LangOptions &LO);
// Get the source text of an expression (may be empty on failure).
std::string exprText(const Expr *e, const SourceManager &SM,
                     const LangOptions &LO);
std::optional<Loc> getLoc(SourceLocation start, SourceLocation end, const SourceManager &SM);
bool shouldSkipFn(const std::string &funcName);
std::string getLambdaVariableName(CXXMethodDecl *FD, ASTContext &Ctx);
std::string exprStr(Expr *E, SourceManager &SM);
