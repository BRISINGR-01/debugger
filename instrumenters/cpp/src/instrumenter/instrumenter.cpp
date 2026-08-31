// ============================================================================
//  instrumenter.cpp  —  Clang AST plugin

// Required by the GCC/Clang plugin loader — declares GPL compatibility.
// Without this symbol the host compiler refuses to dlopen the plugin.
extern "C" int plugin_is_GPL_compatible;
// ============================================================================

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
    SourceLocation start = RS->getBeginLoc();
    if (start.isInvalid() || SM.isInSystemHeader(start))
        return;
    SourceLocation end = RS->getEndLoc();
    if (end.isInvalid() || SM.isInSystemHeader(end))
        return;
    std::optional<Loc> location = getLoc(start, end, SM);
    if (!location.has_value())
        return;

    RW.InsertTextBefore(RS->getBeginLoc(), construct_func_return_ev(*location, RS, SM, LO));
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

FunctionDecl *InstrumentVisitor::getEnclosingFunction(Decl *D)
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

FunctionDecl *InstrumentVisitor::getEnclosingFunctionByLoc(SourceLocation loc)
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

InstrumenterConsumer::InstrumenterConsumer(CompilerInstance &CI)
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

void InstrumenterConsumer::HandleTranslationUnit(ASTContext &Ctx)
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

std::unique_ptr<clang::ASTConsumer, std::default_delete<clang::ASTConsumer>> InstrumenterAction::CreateASTConsumer(CompilerInstance &CI, llvm::StringRef)
{
    auto IC = std::make_unique<InstrumenterConsumer>(CI);
    IC->outputDir = outputDir;
    IC->srcRoot = srcRoot;
    return IC;
}

bool InstrumenterAction::ParseArgs(const CompilerInstance &,
                                   const std::vector<std::string> &args)
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
clang::PluginASTAction::ActionType InstrumenterAction::getActionType() { return AddAfterMainAction; }

static FrontendPluginRegistry::Add<InstrumenterAction>
    X("instrumenter", "Insert debug recorder calls into C/C++ source");