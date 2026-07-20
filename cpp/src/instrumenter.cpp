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

using namespace clang;

// ── helpers ───────────────────────────────────────────────────────────────────

static std::string escape(std::string s)
{
    std::string out;
    out.reserve(s.size());
    for (char c : s)
    {
        if (c == '"' || c == '\\')
            out += '\\';
        out += c;
    }
    return out;
}

static std::string typeStr(QualType qt)
{
    return escape(qt.getUnqualifiedType().getAsString());
}

// Get the source text of an expression (may be empty on failure).
static std::string exprText(const Expr *e, const SourceManager &SM,
                            const LangOptions &LO)
{
    if (!e)
        return {};
    CharSourceRange r = CharSourceRange::getTokenRange(e->getSourceRange());
    bool invalid = false;
    StringRef s = Lexer::getSourceText(r, SM, LO, &invalid);
    if (invalid)
        return {};
    return s.str();
}

// Source location → "file:line"
static std::string locStr(SourceLocation loc, const SourceManager &SM)
{
    if (loc.isInvalid())
        return "";
    PresumedLoc pl = SM.getPresumedLoc(loc);
    if (pl.isInvalid())
        return "";
    std::string f = pl.getFilename();
    // Escape backslashes (Windows paths)
    std::string out;
    for (char c : f)
    {
        if (c == '\\')
            out += "\\\\";
        else
            out += c;
    }
    return out + ":" + std::to_string(pl.getLine());
}

class InstrumentVisitor : public RecursiveASTVisitor<InstrumentVisitor>
{
public:
    explicit InstrumentVisitor(Rewriter &RW, ASTContext &Ctx)
        : RW(RW), Ctx(Ctx), SM(Ctx.getSourceManager()), LO(Ctx.getLangOpts()) {}

    // ── Functions ─────────────────────────────────────────────────────────────
    bool VisitFunctionDecl(FunctionDecl *FD)
    {
        // Only visit function definitions, skip declarations.
        if (!FD->hasBody())
            return true;
        // Skip if already instrumented in this pass or if it's a compiler builtin.
        if (FD->isImplicit())
            return true;
        Stmt *body = FD->getBody();
        if (!body)
            return true;

        SourceLocation bodyStart = body->getBeginLoc();
        if (bodyStart.isInvalid() || SM.isInSystemHeader(bodyStart))
            return true;

        CompoundStmt *CS = dyn_cast<CompoundStmt>(body);
        if (!CS)
            return true;

        std::string funcName = FD->getQualifiedNameAsString();
        std::string file = locStr(bodyStart, SM);

        // ── Build func_enter call ────────────────────────────────────────────
        std::ostringstream entry;
        entry << "\n  /* [recorder] func_enter */\n"
              << "  FuncScopeGuard __rsg__(\"" << escape(funcName)
              << "\", \"" << file << "\", "
              << SM.getPresumedLineNumber(bodyStart) << ");\n"
              << "  __recorder__.func_enter(\""
              << escape(funcName) << "\", \"" << file << "\", "
              << SM.getPresumedLineNumber(bodyStart);

        // Parameters
        bool hasParams = false;
        for (const ParmVarDecl *P : FD->parameters())
        {
            if (P->getName().empty())
                continue;
            hasParams = true;
        }

        if (hasParams)
        {
            entry << ",\n    std::vector<ArgInfo>{\n";
            bool first = true;
            for (const ParmVarDecl *P : FD->parameters())
            {
                if (P->getName().empty())
                    continue;
                if (!first)
                    entry << ",\n";
                first = false;
                std::string pname = P->getNameAsString();
                std::string tname = typeStr(P->getType());
                entry << "      ArgInfo{\"" << escape(pname) << "\", "
                      << "ValueSnapshot::from(" << pname << ", \""
                      << tname << "\")}";
            }
            entry << "\n    }";
        }

        entry << ");\n";

        // Insert after opening brace
        SourceLocation insertPt = CS->getLBracLoc().getLocWithOffset(1);
        RW.InsertTextAfter(insertPt, entry.str());

        // ── Wrap return statements ────────────────────────────────────────────
        instrumentReturns(CS, FD, funcName);

        return true;
    }

    // ── Variable declarations ─────────────────────────────────────────────────
    bool VisitDeclStmt(DeclStmt *DS)
    {
        if (skipDeclStmts_.count(DS))
            return true;

        SourceLocation loc = DS->getBeginLoc();
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return true;

        for (auto *D : DS->decls())
        {

            VarDecl *VD = dyn_cast<VarDecl>(D);
            if (!VD)
                continue;
            if (VD->isImplicit() || VD->getName().empty())
                continue;
            if (VD->hasGlobalStorage())
                continue;

            FunctionDecl *FD = getEnclosingFunction(VD);
            if (!FD)
                continue;

            RW.InsertTextAfterToken(DS->getEndLoc(), buildVarDeclCall(VD, FD, loc));
        }
        return true;
    }

    // ── Assignment expressions ────────────────────────────────────────────────
    bool VisitBinaryOperator(BinaryOperator *BO)
    {
        if (!BO->isAssignmentOp() && !BO->isCompoundAssignmentOp())
            return true;
        SourceLocation loc = BO->getOperatorLoc();
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return true;

        // LHS should be a DeclRefExpr for a local var
        Expr *lhs = BO->getLHS()->IgnoreParenImpCasts();
        DeclRefExpr *DRE = dyn_cast<DeclRefExpr>(lhs);
        if (!DRE)
            return true;
        VarDecl *VD = dyn_cast<VarDecl>(DRE->getDecl());
        if (!VD || VD->hasGlobalStorage())
            return true;

        FunctionDecl *FD = getEnclosingFunction(VD);
        if (!FD)
            return true;

        std::string vname = VD->getNameAsString();
        std::string tname = typeStr(VD->getType());
        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);
        std::string fname = FD->getQualifiedNameAsString();

        // We want to insert AFTER the full expression statement ends.
        // We wrap the assignment in a comma expression trick:
        // Instead of modifying the expression itself, we insert a call
        // right after the statement containing this assignment.
        // We mark it so we don't double-instrument.
        // Use parent map approach: find enclosing Stmt that is a direct
        // child of a CompoundStmt, then insert after it.

        // For simplicity, we'll instrument at the parent statement level
        // via a lambda executed after assignment — but that requires
        // changing the expression. Instead we annotate on the statement.
        // We record the assignment BO and let a second pass handle it.
        pendingAssignments_.push_back({BO, fname, vname, tname, file, line});
        return true;
    }

    // ── Try / Catch ───────────────────────────────────────────────────────────
    bool VisitCXXTryStmt(CXXTryStmt *TS)
    {
        SourceLocation loc = TS->getBeginLoc();
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return true;

        FunctionDecl *FD = getEnclosingFunctionByLoc(loc);
        if (!FD)
            return true;
        std::string fname = FD->getQualifiedNameAsString();
        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);

        // Insert try_enter at start of try body
        CompoundStmt *tryBody = dyn_cast<CompoundStmt>(TS->getTryBlock());
        if (tryBody)
        {
            std::ostringstream call;
            call << "\n  /* [recorder] try_enter */\n"
                 << "  __recorder__.try_enter(\""
                 << escape(fname) << "\", \"" << file << "\", " << line << ");\n";
            RW.InsertTextAfter(tryBody->getLBracLoc().getLocWithOffset(1),
                               call.str());
        }

        // Instrument each catch handler
        for (unsigned i = 0; i < TS->getNumHandlers(); ++i)
        {
            CXXCatchStmt *CS = TS->getHandler(i);
            SourceLocation cloc = CS->getBeginLoc();
            int cline = SM.getPresumedLineNumber(cloc);
            std::string cfile = locStr(cloc, SM);

            std::string exType = "...";
            std::string exVar;
            if (VarDecl *EV = CS->getExceptionDecl())
            {
                exType = typeStr(EV->getType());
                exVar = EV->getNameAsString();
            }

            CompoundStmt *catchBody = dyn_cast<CompoundStmt>(CS->getHandlerBlock());
            if (!catchBody)
                continue;

            std::ostringstream enterCall;
            enterCall << "\n  /* [recorder] catch_enter */\n"
                      << "  __recorder__.catch_enter(\""
                      << escape(fname) << "\", \"" << cfile << "\", " << cline
                      << ", \"" << escape(exType) << "\"";
            if (!exVar.empty())
            {
                // If the exception type has a .what(), use it
                // Otherwise just skip ex_what
                enterCall << " /* ex: " << escape(exVar) << " */";
            }
            enterCall << ");\n";

            SourceLocation insertPt =
                catchBody->getLBracLoc().getLocWithOffset(1);
            RW.InsertTextAfter(insertPt, enterCall.str());

            // Insert catch_exit just before closing brace
            std::ostringstream exitCall;
            exitCall << "\n  /* [recorder] catch_exit */\n"
                     << "  __recorder__.catch_exit(\""
                     << escape(fname) << "\", \"" << cfile << "\", " << cline << ");\n";
            RW.InsertTextBefore(catchBody->getRBracLoc(), exitCall.str());
        }

        return true;
    }

    // ── Throw expressions ─────────────────────────────────────────────────────
    bool VisitCXXThrowExpr(CXXThrowExpr *TE)
    {
        SourceLocation loc = TE->getThrowLoc();
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return true;

        FunctionDecl *FD = getEnclosingFunctionByLoc(loc);
        if (!FD)
            return true;
        std::string fname = FD->getQualifiedNameAsString();
        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);

        std::string exType = "rethrow";
        if (const Expr *sub = TE->getSubExpr())
        {
            exType = typeStr(sub->getType());
        }

        // We can't easily insert before a throw without disrupting the AST.
        // Insert a comma-expression: (__recorder__.throw_site(...), throw ...)
        // We do this by text replacement.
        std::string origText = exprText(TE, SM, LO);
        if (origText.empty())
            return true;

        std::ostringstream replacement;
        replacement << "(__recorder__.throw_site(\""
                    << escape(fname) << "\", \"" << file << "\", " << line
                    << ", \"" << escape(exType) << "\"), "
                    << origText << ")";

        RW.ReplaceText(TE->getSourceRange(), replacement.str());
        return true;
    }

    // ── If/else branch taken ──────────────────────────────────────────────────
    bool VisitIfStmt(IfStmt *IS)
    {
        if (DeclStmt *D = IS->getConditionVariableDeclStmt())
            skipDeclStmts_.insert(D);

        SourceLocation loc = IS->getBeginLoc();
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return true;
        FunctionDecl *FD = getEnclosingFunctionByLoc(loc);
        if (!FD)
            return true;
        std::string fname = FD->getQualifiedNameAsString();
        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);

        auto insertBranchRecord = [&](Stmt *branch, const char *label)
        {
            if (!branch)
                return;
            // Wrap braceless body so insertion is always inside braces.
            bool wasBraceless = !isa<CompoundStmt>(branch);
            ensureBraces(branch);

            std::ostringstream call;
            call << " __recorder__.branch_taken(\""
                 << escape(fname) << "\", \"" << file << "\", " << line
                 << ", \"" << label << "\");";

            if (!wasBraceless)
            {
                CompoundStmt *CS = dyn_cast<CompoundStmt>(branch);
                RW.InsertTextAfter(CS->getLBracLoc().getLocWithOffset(1), call.str());
            }
            else
            {
                RW.InsertTextAfter(branch->getBeginLoc(), call.str());
            }
        };

        insertBranchRecord(IS->getThen(), "then");
        insertBranchRecord(IS->getElse(), "else");
        return true;
    }

    // ── Loop iterations ───────────────────────────────────────────────────────
    bool VisitCXXForRangeStmt(CXXForRangeStmt *FRS)
    {
        if (DeclStmt *D = FRS->getLoopVarStmt())
            skipDeclStmts_.insert(D);
        if (DeclStmt *D = FRS->getRangeStmt())
            skipDeclStmts_.insert(D);
        if (DeclStmt *D = FRS->getBeginStmt())
            skipDeclStmts_.insert(D);
        if (DeclStmt *D = FRS->getEndStmt())
            skipDeclStmts_.insert(D);

        clang::SourceLocation loc = FRS->getBeginLoc();
        std::string loopVar;
        if (VarDecl *LoopVar = FRS->getLoopVariable())
        {
            if (FunctionDecl *FD = getEnclosingFunctionByLoc(loc))
                loopVar = buildVarDeclCall(LoopVar, FD, LoopVar->getLocation());
        }

        return instrumentLoopBody(FRS->getBody(), loc, "for", loopVar);
    }

    bool VisitForStmt(ForStmt *FS)
    {
        if (DeclStmt *D = FS->getConditionVariableDeclStmt())
            skipDeclStmts_.insert(D);

        std::string loopVar;
        if (DeclStmt *D = dyn_cast_or_null<DeclStmt>(FS->getInit()))
        {
            skipDeclStmts_.insert(D);
            // Re-emit var_decl for each declared var, inside the body instead.
            if (FunctionDecl *FD = getEnclosingFunctionByLoc(FS->getBeginLoc()))
            {
                for (Decl *Dcl : D->decls())
                    if (VarDecl *VD = dyn_cast<VarDecl>(Dcl))
                        loopVar += buildVarDeclCall(VD, FD, VD->getLocation());
            }
        }
        return instrumentLoopBody(FS->getBody(), FS->getBeginLoc(), "for", loopVar);
    }

    bool VisitWhileStmt(WhileStmt *WS)
    {
        if (DeclStmt *D = WS->getConditionVariableDeclStmt())
            skipDeclStmts_.insert(D);

        return instrumentLoopBody(WS->getBody(), WS->getBeginLoc(), "while");
    }

    bool VisitDoStmt(DoStmt *DS)
    {
        return instrumentLoopBody(DS->getBody(), DS->getBeginLoc(), "do");
    }

    // ── Post-pass: flush pending assignments ──────────────────────────────────
    void flushPendingAssignments()
    {
        for (auto &pa : pendingAssignments_)
        {
            // Insert after the full parent statement.
            // We rely on a simple heuristic: find the ';' after the BO end.
            SourceLocation stmtEnd = Lexer::findLocationAfterToken(
                pa.bo->getEndLoc(), tok::semi, SM, LO, false);
            if (stmtEnd.isInvalid())
                continue;

            std::ostringstream call;
            call << "\n  /* [recorder] var_change: " << pa.varName << " */\n"
                 << "  if (true) { __recorder__.var_change(\""
                 << escape(pa.funcName) << "\", \"" << pa.file << "\", "
                 << pa.line << ", \"" << escape(pa.varName) << "\", "
                 << pa.varName << ", \"" << pa.typeName << "\"); }\n";

            RW.InsertTextAfter(stmtEnd, call.str());
        }
        pendingAssignments_.clear();
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
    void instrumentReturns(CompoundStmt *CS, FunctionDecl *FD,
                           const std::string &fname)
    {
        // We do a recursive walk manually since the visitor top-level call
        // might descend into nested lambdas. We only want returns at this
        // function level.
        walkForReturns(CS, FD, fname);
    }

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
        SourceLocation loc = RS->getBeginLoc();
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return;

        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);

        // Mark scope guard that an explicit return was hit
        // (so FuncScopeGuard::~FuncScopeGuard won't double-emit func_exit)
        std::string markGuard = "__rsg__.returned = true; ";

        if (Expr *retVal = RS->getRetValue())
        {
            std::string tname = typeStr(retVal->getType());
            std::string rtext = exprText(retVal, SM, LO);
            if (rtext.empty())
                return;

            // We rewrite:
            //   return EXPR;
            // to:
            //   { auto __ret__ = EXPR;
            //     __recorder__.func_return(..., __ret__, "T");
            //     __rsg__.returned = true;
            //     return __ret__; }
            std::ostringstream repl;
            repl << "{ auto __ret_val__ = (" << rtext << ");\n"
                 << "  __recorder__.func_return(\""
                 << escape(fname) << "\", \"" << file << "\", " << line
                 << ", __ret_val__, \"" << tname << "\");\n"
                 << "  " << markGuard << "\n"
                 << "  return __ret_val__; }";

            RW.ReplaceText(RS->getSourceRange(), repl.str());
        }
        else
        {
            // void return
            std::ostringstream repl;
            repl << "{ __recorder__.func_return_void(\""
                 << escape(fname) << "\", \"" << file << "\", " << line << ");\n"
                 << "  " << markGuard << " return; }";
            RW.ReplaceText(RS->getSourceRange(), repl.str());
        }
    }

    // Ensure a statement body is wrapped in braces (for braceless if/loop bodies).
    void ensureBraces(Stmt *body)
    {
        if (!body || isa<CompoundStmt>(body))
            return;
        RW.InsertTextBefore(body->getBeginLoc(), "{ ");
        RW.InsertTextAfterToken(body->getEndLoc(), " }");
    }

    bool instrumentLoopBody(Stmt *body, SourceLocation loc,
                            const char *kind, const std::string &loopVar = "")
    {
        if (!body)
            return true;
        if (loc.isInvalid() || SM.isInSystemHeader(loc))
            return true;
        FunctionDecl *FD = getEnclosingFunctionByLoc(loc);
        if (!FD)
            return true;
        std::string fname = FD->getQualifiedNameAsString();
        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);

        bool wasBraceless = !isa<CompoundStmt>(body);
        ensureBraces(body);

        std::ostringstream call;
        call << " __recorder__.loop_iter(\""
             << escape(fname) << "\", \"" << file << "\", " << line
             << ", \"" << kind << "\");" << loopVar;

        if (!wasBraceless)
        {
            CompoundStmt *CS = dyn_cast<CompoundStmt>(body);
            RW.InsertTextAfter(CS->getLBracLoc().getLocWithOffset(1), call.str());
        }
        else
        {
            RW.InsertTextAfter(body->getBeginLoc(), call.str());
        }
        return true;
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

    std::string buildVarDeclCall(VarDecl *VD, FunctionDecl *FD,
                                 SourceLocation loc)
    {
        std::string vname = VD->getNameAsString();
        std::string tname = typeStr(VD->getType());
        std::string file = locStr(loc, SM);
        int line = SM.getPresumedLineNumber(loc);
        std::string fname = FD->getQualifiedNameAsString();

        std::ostringstream call;
        call << " __recorder__.var_decl(\""
             << escape(fname) << "\", \"" << file << "\", " << line
             << ", \"" << escape(vname) << "\", "
             << vname << ", \"" << tname << "\");";
        return call.str();
    }

    // Allow the consumer to inject a lookup function
public:
    std::function<FunctionDecl *(SourceLocation)> fnLookup;
};

// ── AST Consumer ─────────────────────────────────────────────────────────────

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
        visitor.flushPendingAssignments();

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

// ── Plugin action ─────────────────────────────────────────────────────────────

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
    X("instrumenter", "Insert debug recorder calls into C++ source");