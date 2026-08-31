#include "./include/instrumenter.hpp"
#include "./include/utils.hpp"

bool InstrumentVisitor::VisitFunctionDecl(FunctionDecl *FD)
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
    if (func == "(lambda)::operator()")
    {
        func = getLambdaVariableName(static_cast<CXXMethodDecl *>(FD), Ctx);
    }
    else if (shouldSkipFn(func))
    {
        RW.InsertTextAfter(insertPt, " ");
        // in case of a single file with nothing else to instrument, signify the file has to be copied still
        return false;
    }

    std::string file = p_start.getFilename();
    RW.InsertTextAfter(insertPt, construct_func_enter_ev(file, *location, func, FD, LO));

    // ── Wrap return statements ────────────────────────────────────────────
    walkForReturns(CS, FD, func);

    if (FD->getReturnType()->isVoidType())
    {
        SourceLocation insertLoc = CS->getRBracLoc();

        auto endLocation = getLoc(insertLoc, insertLoc, SM);
        if (endLocation.has_value())
        {
            RW.InsertTextAfter(insertLoc, construct_func_exit_ev(*endLocation));
        }
        else
        {
            RW.InsertTextAfter(insertLoc, construct_func_exit_ev(*location));
        }
    }

    return true;
}

bool InstrumentVisitor::VisitLambdaExpr(LambdaExpr *LE)
{
    if (!LE)
        return true;

    CXXMethodDecl *FD = LE->getCallOperator();
    if (!FD)
        return true;

    return VisitFunctionDecl(FD);
}
