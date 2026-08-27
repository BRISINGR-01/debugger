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

#include "./include/utils.hpp"
#include "./include/construct_calls.hpp"

class InstrumentVisitor : public RecursiveASTVisitor<InstrumentVisitor>
{
public:
    explicit InstrumentVisitor(Rewriter &RW, ASTContext &Ctx)
        : RW(RW), Ctx(Ctx), SM(Ctx.getSourceManager()), LO(Ctx.getLangOpts()) {}

    // ── Functions ─────────────────────────────────────────────────────────────
    bool VisitFunctionDecl(FunctionDecl *FD)
    {
        // std::string func1 = FD->getQualifiedNameAsString();
        // std::cout << func1 << std::endl;

        if (!FD->hasBody() || !FD->isThisDeclarationADefinition()) // Only visit function definitions, skip declarations.
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

        CompoundStmt *CS = dyn_cast<CompoundStmt>(body);
        if (!CS)
            return true;

        // Insert after opening brace
        SourceLocation insertPt = CS->getLBracLoc().getLocWithOffset(1);

        std::string func = FD->getQualifiedNameAsString();
        if (shouldSkipFn(func))
        {
            RW.InsertTextAfter(insertPt, " ");
            // in case of a single file with nothing else to instrument, signify the file has to be copied still
            return true;
        }

        std::string file = p_start.getFilename();
        RW.InsertTextAfter(insertPt, construct_func_enter(file, *location, func, FD));

        // ── Wrap return statements ────────────────────────────────────────────
        walkForReturns(CS, FD, func);

        std::cout << func << std::endl;

        if (FD->getReturnType()->isVoidType())
        {
            SourceLocation insertLoc = CS->getRBracLoc();

            auto endLocation = getLoc(insertLoc, insertLoc, SM);
            if (endLocation.has_value())
            {
                RW.InsertTextAfter(insertLoc, construct_func_exit(*endLocation));
            }
            else
            {
                RW.InsertTextAfter(insertLoc, construct_func_exit(*location));
            }
        }

        return true;
    }

    bool VisitIfStmt(IfStmt *S)
    {
        ensureBraces(S->getThen());

        // Wrap the else-branch UNLESS it's itself another `if`
        // (that's a normal else-if chain and each `if` gets visited on its own).
        if (Stmt *Else = S->getElse())
            if (!isa<IfStmt>(Else))
                ensureBraces(Else);

        return true;
    }

    bool VisitWhileStmt(WhileStmt *S)
    {
        ensureBraces(S->getBody());
        return true;
    }

    bool VisitDoStmt(DoStmt *S)
    {
        ensureBraces(S->getBody());
        return true;
    }

    bool VisitForStmt(ForStmt *S)
    {
        ensureBraces(S->getBody());
        return true;
    }

    bool VisitCXXForRangeStmt(CXXForRangeStmt *S)
    {
        ensureBraces(S->getBody());
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

        RW.InsertTextBefore(RS->getBeginLoc(), construct_func_return(*location, RS, SM, LO));
    }

    // Ensure a statement body is wrapped in braces (for braceless if/loop bodies).
    void ensureBraces(Stmt *body)
    {
        if (!body || isa<CompoundStmt>(body))
            return;

        const LangOptions &LangOpts = Ctx.getLangOpts();

        SourceLocation end = SM.getExpansionLoc(body->getEndLoc());

        // Move end to just past the last token of the statement (handles the
        // trailing ';' for expression/decl statements correctly).
        end = Lexer::getLocForEndOfToken(end, 0, SM, LangOpts);
        if (end.isInvalid())
            return;

        RW.InsertTextBefore(body->getBeginLoc(), "{ ");
        RW.InsertTextAfterToken(end, " }");
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
    std::string outputDir;
    std::string srcRoot;

    explicit InstrumenterConsumer(CompilerInstance &CI)
        : CI(CI), RW(CI.getSourceManager(), CI.getLangOpts())
    {
        const std::filesystem::path currFile = __FILE__;
        const std::filesystem::path impl_path = currFile.parent_path().parent_path() / "recorder" / "recorder.cpp";
        const std::filesystem::path print_h_path = currFile.parent_path().parent_path() / "recorder" / "dbg-header.hpp";

        std::ifstream impl_file(impl_path.c_str());
        if (!impl_file.is_open())
        {
            std::cerr << "Error opening \"" << impl_path << '"' << std::endl;
            exit(1);
        }

        std::ifstream print_h_file(print_h_path.c_str());
        if (!print_h_file.is_open())
        {
            std::cerr << "Error opening \"" << print_h_path << '"' << std::endl;
            exit(1);
        }

        std::ostringstream ss;
        ss << print_h_file.rdbuf() << impl_file.rdbuf();
        recorderImpl = ss.str();

        impl_file.close();
        print_h_file.close();
    }

    void HandleTranslationUnit(ASTContext &Ctx) override
    {
        SourceManager &SM = Ctx.getSourceManager();

        // Filter FunctionDecl lookup
        std::vector<std::pair<SourceRange, FunctionDecl *>> fdRanges;
        for (auto *D : Ctx.getTranslationUnitDecl()->decls())
        {
            SourceLocation loc = D->getLocation();
            if (loc.isInvalid())
                continue;

            auto p_loc = SM.getPresumedLoc(loc);
            if (p_loc.isInvalid())
                continue;
            std::string file = p_loc.getFilename();
            // Skip decls outside your source tree
            if (!file.starts_with(srcRoot))
                continue;

            std::cout << file << std::endl;

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

        // Filter Rewriter output
        for (auto I = RW.buffer_begin(), E = RW.buffer_end(); I != E; ++I)
        {
            const FileEntry *FE = SM.getFileEntryForID(I->first);
            if (!FE)
                continue;

            SourceLocation fileStartLoc = SM.getLocForStartOfFile(I->first);

            std::filesystem::path file = FE->tryGetRealPathName().str();

            // Skip writing files that are outside your workspace or are system headers
            if (!file.string().starts_with(srcRoot))
                continue;

            std::cout << file << std::endl;

            std::filesystem::path out = outputDir;
            out /= file.filename();

            std::error_code EC;
            llvm::raw_fd_ostream os(out.c_str(), EC, llvm::sys::fs::OF_Text);
            if (EC)
            {
                llvm::errs() << "Cannot write \"" << out << "\": " << EC.message() << "\n";
                continue;
            }
            os << recorderImpl;
            I->second.write(os);

            llvm::outs() << "[instrumenter] wrote: " << out << "\n";
        }
    }

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
    CreateASTConsumer(CompilerInstance &CI, llvm::StringRef) override
    {
        auto IC = std::make_unique<InstrumenterConsumer>(CI);
        IC->outputDir = outputDir;
        IC->srcRoot = srcRoot;
        return IC;
    }

    bool ParseArgs(const CompilerInstance &,
                   const std::vector<std::string> &args) override
    {
        if (args.size() != 1)
        {
            std::cerr << "The instrumentation plugin requires a single argument - path to debug destination" << std::endl;
            exit(1);
        }

        outputDir = args[0];
        srcRoot = std::filesystem::path(outputDir).parent_path();
        return true;
    }

    // Run after the main action (parsing) so we get the full AST.
    ActionType getActionType() override { return AddAfterMainAction; }
};

static FrontendPluginRegistry::Add<InstrumenterAction>
    X("instrumenter", "Insert debug recorder calls into C/C++ source");