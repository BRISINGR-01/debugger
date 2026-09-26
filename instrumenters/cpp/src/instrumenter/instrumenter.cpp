#include "./include/instrumenter.hpp"

InstrumentVisitor::InstrumentVisitor(Rewriter &RW, ASTContext &Ctx)
    : RW(RW), Ctx(Ctx), SM(Ctx.getSourceManager()), LO(Ctx.getLangOpts()) {}

bool InstrumentVisitor::VisitWhileStmt(WhileStmt *S)
{
    ensureBraces(S->getBody());
    return true;
}

bool InstrumentVisitor::VisitDoStmt(DoStmt *S)
{
    ensureBraces(S->getBody());
    return true;
}

bool InstrumentVisitor::VisitForStmt(ForStmt *S)
{
    ensureBraces(S->getBody());
    return true;
}

bool InstrumentVisitor::VisitCXXForRangeStmt(CXXForRangeStmt *S)
{
    ensureBraces(S->getBody());
    return true;
}

bool InstrumentVisitor::VisitRecordDecl(clang::RecordDecl *RD)
{
    // Only inspect definitions of structs/classes
    if (!RD->isCompleteDefinition() || !RD->isStruct() || !RD->getDefinition())
        return true;

    // 2. Handle C++ specific template constraints
    if (auto *CXXRD = clang::dyn_cast<clang::CXXRecordDecl>(RD))
    {
        // Skip template definitions that aren't concrete instantiations
        if (CXXRD->isDependentType() ||
            CXXRD->getDescribedClassTemplate() != nullptr)
        {
            return true;
        }

        std::cout << RD->getNameAsString() << std::endl;
        // Optional: Skip standard library internal structs if you don't want them
        if (Ctx.getSourceManager().isInSystemHeader(RD->getLocation()))
        {
            // return true;
        }
    }

    // std::cout << construct_c_struct_fn(RD, RW) << std::endl;

    return true;
}

// Walk all ReturnStmts inside a FunctionDecl body and insert recorder call.
// We do a recursive walk manually since the visitor top-level call
// might descend into nested lambdas. We only want returns at this
// function level.
void InstrumentVisitor::walkForReturns(Stmt *S, FunctionDecl *FD, const std::string &fname)
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
void InstrumentVisitor::instrumentReturn(ReturnStmt *RS, FunctionDecl *FD,
                                         const std::string &fname)
{
    Expr *RetExpr = RS->getRetValue();
    if (!RetExpr)
    {
        // e.g. `return;`
        std::optional<Loc> loc = getLoc(RS->getBeginLoc(), RS->getEndLoc(), SM);
        if (!loc.has_value())
            return;

        RW.InsertTextBefore(RS->getBeginLoc(), construct_func_exit_ev(*loc));
        return;
    }

    std::optional<Loc> loc = getLoc(RetExpr->getBeginLoc(), Lexer::getLocForEndOfToken(RetExpr->getEndLoc(), 0, SM, LO), SM);
    if (!loc.has_value())
        return;

    RW.InsertTextBefore(RS->getBeginLoc(), construct_func_return_ev(*loc, RS, SM, LO));
}

// Ensure a statement body is wrapped in braces (for braceless if/loop bodies).
void InstrumentVisitor::ensureBraces(Stmt *body)
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

InstrumenterConsumer::InstrumenterConsumer(CompilerInstance &CI)
    : CI(CI), RW(CI.getSourceManager(), CI.getLangOpts())
{
    const std::filesystem::path currFile = __FILE__;
    const std::filesystem::path common_path = currFile.parent_path().parent_path() / "recorder" / "common.hpp";
    const std::filesystem::path declaration_path = currFile.parent_path().parent_path() / "recorder" / "declaration.hpp";
    const std::filesystem::path impl_path = currFile.parent_path().parent_path() / "recorder" / "implementation.cpp";

    recorderCommon = read_file(common_path);
    recorderImpl = read_file(impl_path);
    recorderDecl = read_file(declaration_path);
}

void InstrumenterConsumer::HandleTranslationUnit(ASTContext &Ctx)
{
    SourceManager &SM = Ctx.getSourceManager();
    InstrumentVisitor visitor(RW, Ctx);

    visitor.TraverseDecl(Ctx.getTranslationUnitDecl());

    bool isImplPresent = false;
    // Filter Rewriter output
    for (auto I = RW.buffer_begin(), E = RW.buffer_end(); I != E; ++I)
    {
        const FileEntry *FE = SM.getFileEntryForID(I->first);
        if (!FE)
            continue;

        std::filesystem::path file = FE->tryGetRealPathName().str();

        // Skip writing files that are outside the workspace
        if (!file.string().starts_with(srcRoot.string()))
            continue;

        std::filesystem::path out = outputDir / file.filename();

        std::error_code EC;
        llvm::raw_fd_ostream os(out.c_str(), EC, llvm::sys::fs::OF_Text);
        if (EC)
        {
            llvm::errs() << "Cannot write \"" << out << "\": " << EC.message() << "\n";
            continue;
        }

        os << recorderCommon << '\n';
        if (!isImplPresent)
        {
            isImplPresent = true;
            os << recorderImpl << '\n';
        }
        else
        {
            os << recorderDecl << '\n';
        }

        I->second.write(os);

        llvm::outs() << "[instrumenter] wrote: " << out << "\n";
    }
}
