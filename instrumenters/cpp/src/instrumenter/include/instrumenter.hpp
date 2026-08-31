#pragma once
// ============================================================================
//  instrumenter.cpp  —  Clang AST plugin

// Required by the GCC/Clang plugin loader — declares GPL compatibility.
// Without this symbol the host compiler refuses to dlopen the plugin.
//
//  Instruments C++ source with recorder calls at:
//    • function entry / return / fall-through exit
//    • local variable declarations (with initialiser)
//    • assignments (BinaryOperator '=', compound-assign)
//    • try blocks / catch clauses / throw expressions
//    • if/else/switch branches
//    • for/while/do loop iterations
//
//  Build:
//      cmake -B build && cmake --build build
//
//  Usage:
//      clang++ -fplugin=./build/Instrumenter.so \
//              -include recorder_runtime.h \
//              -std=c++20 -c example.cpp
// ============================================================================
#include "clang/AST/ASTConsumer.h"
#include "clang/AST/RecursiveASTVisitor.h"
#include "clang/Frontend/CompilerInstance.h"
#include "clang/Frontend/FrontendPluginRegistry.h"
#include "clang/Rewrite/Core/Rewriter.h"
#include "clang/Lex/Lexer.h"
#include "clang/Basic/SourceManager.h"
#include "clang/Basic/FileManager.h"
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

class InstrumentVisitor : public RecursiveASTVisitor<InstrumentVisitor>
{
public:
    explicit InstrumentVisitor(Rewriter &RW, ASTContext &Ctx);

    // ── Functions ─────────────────────────────────────────────────────────────
    bool VisitFunctionDecl(FunctionDecl *FD);
    bool VisitLambdaExpr(LambdaExpr *LE);

    bool VisitDeclStmt(DeclStmt *DS);
    // bool VisitBinaryOperator(BinaryOperator *BO);
    bool TraverseCompoundStmt(CompoundStmt *CS);
    bool TraverseUnaryOperator(UnaryOperator *UO);
    bool TraverseIfStmt(IfStmt *IS);
    bool TraverseBinaryOperator(BinaryOperator *BO);

    bool VisitWhileStmt(WhileStmt *S);
    bool VisitDoStmt(DoStmt *S);
    bool VisitForStmt(ForStmt *S);
    bool VisitCXXForRangeStmt(CXXForRangeStmt *S);

private:
    Rewriter &RW;
    ASTContext &Ctx;
    SourceManager &SM;
    const LangOptions &LO;
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
    FunctionDecl *getEnclosingFunction(Decl *D);
    FunctionDecl *getEnclosingFunctionByLoc(SourceLocation loc);

public:
    // Allow the consumer to inject a lookup function
    std::function<FunctionDecl *(SourceLocation)> fnLookup;
};

class InstrumenterConsumer : public ASTConsumer
{
public:
    std::string outputDir;
    std::string srcRoot;

    explicit InstrumenterConsumer(CompilerInstance &CI);
    void HandleTranslationUnit(ASTContext &Ctx) override;

private:
    CompilerInstance &CI;
    Rewriter RW;
    std::string recorderImpl;
};

class InstrumenterAction : public PluginASTAction
{

private:
    std::string outputDir;
    std::string srcRoot;

public:
    std::unique_ptr<ASTConsumer>
    CreateASTConsumer(CompilerInstance &CI, llvm::StringRef) override;
    bool ParseArgs(const CompilerInstance &,
                   const std::vector<std::string> &args) override;
    // Run after the main action (parsing) so we get the full AST.
    ActionType getActionType() override;
};
