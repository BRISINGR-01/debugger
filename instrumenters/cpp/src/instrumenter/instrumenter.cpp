// ============================================================================
//  instrumenter.cpp  —  Clang AST plugin

// Required by the GCC/Clang plugin loader — declares GPL compatibility.
// Without this symbol the host compiler refuses to dlopen the plugin.
extern "C" int plugin_is_GPL_compatible;
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
//              -std=c++17 -c example.cpp
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
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

#include "./include/utils.hpp"
#include "./include/dbg_calls.hpp"

class InstrumentVisitor : public RecursiveASTVisitor<InstrumentVisitor>
{
public:
    explicit InstrumentVisitor(Rewriter &RW, ASTContext &Ctx)
        : RW(RW), Ctx(Ctx), SM(Ctx.getSourceManager()), LO(Ctx.getLangOpts()) {}

    // ── Functions ─────────────────────────────────────────────────────────────
    bool VisitFunctionDecl(FunctionDecl *FD)
    {
        if (!FD->hasBody()) // Only visit function definitions, skip declarations.
            return true;
        if (FD->isImplicit()) // Skip if already instrumented in this pass or if it's a compiler builtin.
            return true;

        Stmt *body = FD->getBody();
        if (!body)
            return true;

        SourceLocation bodyStart = body->getBeginLoc();
        if (bodyStart.isInvalid() || SM.isInSystemHeader(bodyStart))
            return true;
        SourceLocation bodyEnd = body->getEndLoc();
        if (bodyEnd.isInvalid() || SM.isInSystemHeader(bodyEnd))
            return true;
        std::optional<Loc> location = getLoc(bodyStart, bodyEnd, SM);
        if (!location.has_value())
            return true;

        PresumedLoc p_start = SM.getPresumedLoc(bodyStart);
        if (p_start.isInvalid())
            return true;
        std::string file = p_start.getFilename();

        CompoundStmt *CS = dyn_cast<CompoundStmt>(body);
        if (!CS)
            return true;

        std::string func = FD->getQualifiedNameAsString();

        // Insert after opening brace
        SourceLocation insertPt = CS->getLBracLoc().getLocWithOffset(1);
        RW.InsertTextAfter(insertPt, construct_func_enter(file, *location, func, FD));

        // ── Wrap return statements ────────────────────────────────────────────
        walkForReturns(CS, FD, func);

        return true;
    }

private:
    Rewriter &RW;
    ASTContext &Ctx;
    SourceManager &SM;
    const LangOptions &LO;
    std::set<DeclStmt *> skipDeclStmts_;

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
    void walkForReturns(Stmt *S, FunctionDecl *FD, const std::string &fname)
    {
        if (!S)
            return;

        // Don't descend into nested lambdas/function bodies
        if (isa<LambdaExpr>(S))
            return;

        if (ReturnStmt *RS = dyn_cast<ReturnStmt>(S))
        {
            instrumentReturn(RS, FD, fname);
            return;
        }

        for (Stmt *child : S->children())
        {
            walkForReturns(child, FD, fname);
        }
    }

    void instrumentReturn(ReturnStmt *RS, FunctionDecl *FD,
                          const std::string &fname)
    {
        SourceLocation start = RS->getBeginLoc();
        if (start.isInvalid() || SM.isInSystemHeader(start))
            return;
        SourceLocation end = RS->getEndLoc();
        if (end.isInvalid() || SM.isInSystemHeader(end))
            return;
        std::optional<Loc> location = getLoc(start, end, SM);
        if (!location.has_value())
            return;

        RW.ReplaceText(RS->getSourceRange(), construct_func_return(*location, RS, SM, LO));
    }

    // Ensure a statement body is wrapped in braces (for braceless if/loop bodies).
    void ensureBraces(Stmt *body)
    {
        if (!body || isa<CompoundStmt>(body))
            return;
        RW.InsertTextBefore(body->getBeginLoc(), "{ ");
        RW.InsertTextAfterToken(body->getEndLoc(), " }");
    }

    FunctionDecl *getEnclosingFunction(Decl *D)
    {
        DeclContext *DC = D->getDeclContext();
        while (DC)
        {
            if (FunctionDecl *FD = dyn_cast<FunctionDecl>(DC))
                return FD;
            DC = DC->getParent();
        }
        return nullptr;
    }

    FunctionDecl *getEnclosingFunctionByLoc(SourceLocation loc)
    {
        // Walk parents via the ParentMap stored on Ctx
        // This is a best-effort approach using the AST DeclContext chain.
        // For simplicity we cache a map from FileID+offset to FD on first use.
        // Here we just return nullptr when we can't determine it easily —
        // the instrumentation will simply be skipped for that statement.
        if (fnLookup)
            return fnLookup(loc);
        return nullptr; // overridden below per-consumer
    }

public:
    // Allow the consumer to inject a lookup function
    std::function<FunctionDecl *(SourceLocation)> fnLookup;
};

class InstrumenterConsumer : public ASTConsumer
{
public:
    explicit InstrumenterConsumer(CompilerInstance &CI)
        : CI(CI), RW(CI.getSourceManager(), CI.getLangOpts()) {}

    void HandleTranslationUnit(ASTContext &Ctx) override
    {
        SourceManager &SM = Ctx.getSourceManager();

        // Build a quick FunctionDecl lookup by source range.
        // We gather all FDs first, then provide a closure.
        std::vector<std::pair<SourceRange, FunctionDecl *>> fdRanges;
        for (auto *D : Ctx.getTranslationUnitDecl()->decls())
        {
            if (auto *FD = dyn_cast<FunctionDecl>(D))
            {
                if (FD->hasBody())
                    fdRanges.push_back({FD->getSourceRange(), FD});
            }
            // Also handle namespace-level functions
            if (auto *NS = dyn_cast<NamespaceDecl>(D))
            {
                for (auto *ND : NS->decls())
                {
                    if (auto *FD = dyn_cast<FunctionDecl>(ND))
                    {
                        if (FD->hasBody())
                            fdRanges.push_back({FD->getSourceRange(), FD});
                    }
                }
            }
        }

        InstrumentVisitor visitor(RW, Ctx);

        // Provide a location-to-FD lookup
        visitor.fnLookup = [&](SourceLocation loc) -> FunctionDecl *
        {
            for (auto &[range, FD] : fdRanges)
            {
                if (SM.isPointWithin(loc, range.getBegin(), range.getEnd()))
                    return FD;
            }
            return nullptr;
        };

        visitor.TraverseDecl(Ctx.getTranslationUnitDecl());
        // visitor.flushPendingAssignments();

        // Write rewritten buffers back to source files
        for (auto I = RW.buffer_begin(), E = RW.buffer_end(); I != E; ++I)
        {
            const FileEntry *FE =
                SM.getFileEntryForID(I->first);
            if (!FE)
                continue;

            std::string outPath = std::string(FE->tryGetRealPathName()) + ".instrumented";
            std::error_code EC;
            llvm::raw_fd_ostream os(outPath, EC, llvm::sys::fs::OF_Text);
            if (EC)
            {
                llvm::errs() << "Cannot write " << outPath << ": "
                             << EC.message() << "\n";
                continue;
            }
            I->second.write(os);
            llvm::outs() << "[instrumenter] wrote: " << outPath << "\n";
        }
    }

private:
    CompilerInstance &CI;
    Rewriter RW;
};

class InstrumenterAction : public PluginASTAction
{
public:
    std::unique_ptr<ASTConsumer>
    CreateASTConsumer(CompilerInstance &CI, llvm::StringRef) override
    {
        return std::make_unique<InstrumenterConsumer>(CI);
    }

    bool ParseArgs(const CompilerInstance &,
                   const std::vector<std::string> &args) override
    {
        for (const auto &a : args)
        {
            if (a == "-help")
            {
                llvm::outs() << "Instrumenter plugin options:\n"
                                "  (none yet)\n";
            }
        }
        return true;
    }

    // Run after the main action (parsing) so we get the full AST.
    ActionType getActionType() override { return AddAfterMainAction; }
};

static FrontendPluginRegistry::Add<InstrumenterAction>
    X("instrumenter", "Insert debug recorder calls into C/C++ source");