#include "./include/instrumenter.hpp"
#include "./include/utils.hpp"

bool InstrumentVisitor::VisitFunctionDecl(FunctionDecl *FD)
{

    if (!FD->hasBody() || !FD->isThisDeclarationADefinition()) // Only visit function definitions, skip declarations.
        return true;
    if (FD->isImplicit()) // Skip if already instrumented in this pass or if it's a compiler builtin.
        return true;

    Stmt *body = FD->getBody();
    if (!body)
        return true;

    serializer.registerIfPrinter(FD);

    std::optional<Loc> location = getLoc(body->getBeginLoc(), body->getEndLoc(), SM);
    if (!location.has_value())
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

    PresumedLoc p_start = SM.getPresumedLoc(body->getBeginLoc());
    if (p_start.isInvalid())
        return true;
    std::string file = p_start.getFilename();
    RW.InsertTextAfter(insertPt, construct_func_enter_ev(file, *location, func, FD, SM, LO, serializer));

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

    RW.InsertTextBefore(RS->getBeginLoc(), construct_func_return_ev(*loc, RS, SM, LO, serializer));
}
