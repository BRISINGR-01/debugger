#include "./include/instrumenter.hpp"

InstrumentVisitor::InstrumentVisitor(Rewriter &RW, ASTContext &Ctx, ValueSerializer &serializer)
    : RW(RW), Ctx(Ctx), SM(Ctx.getSourceManager()), LO(Ctx.getLangOpts()), serializer(serializer) {}

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
    if (!RD->isCompleteDefinition() || RD->isImplicit() || !RD->getDefinition() || RD->getNameAsString().starts_with("_"))
        return true;

    if (RD->getIdentifier() == nullptr && !RD->getTypedefNameForAnonDecl())
        return true;

    // 2. Handle C++ specific template constraints
    if (auto *CXXRD = clang::dyn_cast<clang::CXXRecordDecl>(RD))
    {
        // Skip template definitions that aren't concrete instantiations
        if (CXXRD->isDependentType() ||
            CXXRD->getDescribedClassTemplate() != nullptr)
            return true;
    }

    // Skip standard library internal structs if you don't want them
    SourceLocation Loc = RD->getLocation();
    SourceManager &SM = Ctx.getSourceManager();
    if (SM.isInSystemHeader(Loc) || SM.isInSystemHeader(SM.getSpellingLoc(Loc)))
        return true;

    // if (isa<ClassTemplateSpecializationDecl>(RD))
    //     return true; // skip all instantiations/specializations of class templates

    serializer.constructStructPrinter(RD, RW);

    return true;
}

bool InstrumentVisitor::VisitEnumDecl(clang::EnumDecl *ED)
{
    // Skip enums nested in uninstantiated templates: getQualifiedNameAsString()
    // may embed unresolved template parameter text there, which isn't valid
    // as a standalone type reference.
    if (ED->isTemplated() || ED->getDeclContext()->isDependentContext())
        return true;

    // Skip standard library internal structs if you don't want them
    SourceLocation Loc = ED->getLocation();
    SourceManager &SM = Ctx.getSourceManager();
    if (SM.isInSystemHeader(Loc) || SM.isInSystemHeader(SM.getSpellingLoc(Loc)))
        return true;

    serializer.constructEnumPrinter(ED, RW);

    return true;
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
    : CI(CI), RW(CI.getSourceManager(), CI.getLangOpts()), serializer(ValueSerializer(CI.getASTContext(), RW))
{
    const std::filesystem::path header = std::filesystem::path(__FILE__).parent_path().parent_path() / "recorder" / "recorder.hpp";
    dbgHeader = read_file(header);
}

void InstrumenterConsumer::HandleTranslationUnit(ASTContext &Ctx)
{
    SourceManager &SM = Ctx.getSourceManager();
    InstrumentVisitor visitor(RW, Ctx, serializer);

    visitor.TraverseDecl(Ctx.getTranslationUnitDecl());

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

        const std::filesystem::path out = outputDir / file.filename();

        std::error_code EC;
        llvm::raw_fd_ostream os(out.c_str(), EC, llvm::sys::fs::OF_Text);
        if (EC)
        {
            llvm::errs() << "Cannot write \"" << out << "\": " << EC.message() << "\n";
            continue;
        }

        os << dbgHeader << '\n'
           << construct_serializer_header(serializer) << '\n';
        I->second.write(os);

        llvm::outs() << "[instrumenter] wrote: " << out << "\n";
    }
}
