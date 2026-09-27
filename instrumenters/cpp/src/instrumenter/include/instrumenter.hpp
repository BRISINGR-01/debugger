#pragma once
#include "clang/AST/ASTConsumer.h"
#include "clang/AST/RecursiveASTVisitor.h"
#include "clang/Frontend/CompilerInstance.h"
#include "clang/Frontend/FrontendPluginRegistry.h"
#include "clang/Rewrite/Core/Rewriter.h"
#include "clang/Lex/Lexer.h"
#include "clang/Basic/SourceManager.h"
#include "clang/Basic/FileManager.h"
#include "clang/AST/RecordLayout.h"
#include "llvm/Support/raw_ostream.h"

#include <set>
#include <sstream>
#include <string>
#include <vector>
#include <iostream>
#include <filesystem>
#include <fstream>

#include "./utils.hpp"
#include "./construct_calls.hpp"
#include "./schema.hpp"
#include "serialize/ValueSerializer.hpp"

class InstrumentVisitor : public RecursiveASTVisitor<InstrumentVisitor>
{
public:
    explicit InstrumentVisitor(Rewriter &RW, ASTContext &Ctx);

    // ── Functions ─────────────────────────────────────────────────────────────
    bool VisitFunctionDecl(FunctionDecl *FD);
    bool VisitLambdaExpr(LambdaExpr *LE);

    bool VisitDeclStmt(DeclStmt *DS);
    bool TraverseCompoundStmt(CompoundStmt *CS);
    bool TraverseUnaryOperator(UnaryOperator *UO);
    bool TraverseIfStmt(IfStmt *IS);
    bool TraverseBinaryOperator(BinaryOperator *BO);

    bool VisitWhileStmt(WhileStmt *S);
    bool VisitDoStmt(DoStmt *S);
    bool VisitForStmt(ForStmt *S);
    bool VisitCXXForRangeStmt(CXXForRangeStmt *S);
    bool VisitRecordDecl(clang::RecordDecl *D);

private:
    Rewriter &RW;
    ASTContext &Ctx;
    SourceManager &SM;
    const LangOptions &LO;
    ValueSerializer serializer;
    std::vector<std::vector<std::string>> pendingStmts;
    int tempCounter_ = 0;

    std::string genVarName()
    {
        return "__ev" + std::to_string(tempCounter_++);
    }

    void pushBoundary() { pendingStmts.emplace_back(); }

    // flush accumulated hoisted lines by inserting them right before `loc`
    void flushBoundary(SourceLocation loc)
    {
        std::string all;
        for (auto &s : pendingStmts.back())
            all += s;
        if (!all.empty())
            RW.InsertTextBefore(loc, all);
        pendingStmts.pop_back();
    }

    struct PendingAssign
    {
        BinaryOperator *bo;
        std::string funcName, varName, typeName, file;
        int line;
    };
    std::vector<PendingAssign> pendingAssignments_;

    // Walk all ReturnStmts inside a FunctionDecl body and insert recorder call.
    // We do a recursive walk manually since the visitor top-level call
    // might descend into nested lambdas. We only want returns at this
    // function level.
    void walkForReturns(Stmt *S, FunctionDecl *FD, const std::string &fname);
    void instrumentReturn(ReturnStmt *RS, FunctionDecl *FD, const std::string &fname);
    // Ensure a statement body is wrapped in braces (for braceless if/loop bodies).
    void ensureBraces(Stmt *body);
};

class InstrumenterConsumer : public ASTConsumer
{
public:
    std::filesystem::path outputDir;
    std::filesystem::path srcRoot;

    explicit InstrumenterConsumer(CompilerInstance &CI);
    void HandleTranslationUnit(ASTContext &Ctx) override;

private:
    CompilerInstance &CI;
    Rewriter RW;
    std::string dbgHeader;
};
