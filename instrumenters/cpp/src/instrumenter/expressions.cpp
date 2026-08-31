#include "./include/instrumenter.hpp"

// ── Variable declarations ─────────────────────────────────────────────────
bool InstrumentVisitor::VisitDeclStmt(DeclStmt *DS)
{

    for (auto *D : DS->decls())
    {
        VarDecl *VD = dyn_cast<VarDecl>(D);
        if (!VD)
            continue;
        if (VD->isImplicit() || VD->getName().empty())
            continue;
        if (VD->hasGlobalStorage())
            continue;

        std::optional<Loc> loc = getLoc(VD->getBeginLoc(), VD->getEndLoc(), SM);
        if (!loc.has_value())
            return true;

        RW.InsertTextAfterToken(DS->getEndLoc(), construct_var_decl_ev(*loc, VD, LO));
    }
    return true;
}

// --- statement-level boundary: every statement directly inside a
// CompoundStmt gets its own hoisting point right before it.
bool InstrumentVisitor::TraverseCompoundStmt(CompoundStmt *CS)
{
    for (Stmt *child : CS->body())
    {
        pushBoundary();
        TraverseStmt(child);
        flushBoundary(child->getBeginLoc());
    }
    return true; // children already handled manually, don't descend again
}

// --- if/for/while conditions need the same treatment, but hoisted
// before the WHOLE enclosing statement, not inside the condition.
bool InstrumentVisitor::TraverseIfStmt(IfStmt *IS)
{

    pushBoundary();
    if (Expr *cond = IS->getCond())
        TraverseStmt(cond);
    flushBoundary(IS->getBeginLoc());

    if (Stmt *then = IS->getThen())
    {
        ensureBraces(then);
        TraverseStmt(then);
    }

    if (Stmt *els = IS->getElse())
    {
        TraverseStmt(els);
        // Wrap the else-branch UNLESS it's itself another `if`
        // (that's a normal else-if chain and each `if` gets visited on its own).
        if (!isa<IfStmt>(els))
            ensureBraces(els);
    }
    return true;
}

// ForStmt/WhileStmt/DoStmt/SwitchStmt/ReturnStmt follow the identical
// pattern: pushBoundary() -> traverse the expr part(s) -> flush before
// the enclosing stmt's begin loc -> then traverse the non-expr parts
// (body, etc.) normally.

// --- post-order handling of binary operators ---
bool InstrumentVisitor::TraverseBinaryOperator(BinaryOperator *BO)
{
    // 1. children first (deepest subexpressions get hoisted/replaced
    //    before we build our own text)
    TraverseStmt(BO->getLHS());
    TraverseStmt(BO->getRHS());

    if (BO->getType()->isVoidType())
        return true; // can't hold a void value in a temp

    std::optional<Loc> loc = getLoc(BO->getBeginLoc(), BO->getEndLoc(), SM);
    if (!loc.has_value())
        return true;

    // 2. now query the REWRITTEN text -- includes children's temp
    //    names already substituted in, e.g. "4 * __ev0" not "4 * (9+a)"
    CharSourceRange fullRange = CharSourceRange::getTokenRange(BO->getSourceRange());
    std::string rewrittenText = RW.getRewrittenText(fullRange);

    std::string newVarName = genVarName();
    std::string type = typeStr(BO->getType(), LO);

    std::ostringstream decl;
    if (BO->isAssignmentOp())
    {
        Expr *LHS = BO->getLHS()->IgnoreParenImpCasts();
        if (isa<DeclRefExpr>(LHS) || isa<MemberExpr>(LHS))
        {
            // Converts original "c = 4 * _evN" into:
            // <type> <oldValName> = c;
            // c = 4 * __evN;
            // __assign(...)

            std::string lhsName = exprStr(LHS, SM);
            std::string oldValName = genVarName();
            decl
                << construct_var_assign(type, oldValName, lhsName)
                << rewrittenText << ";\n"
                << construct_var_assign(type, newVarName, lhsName)
                << construct_assign_ev(*loc, type, lhsName, oldValName, newVarName);
        }
        else
        {
            // LHS has side effects (e.g. arr[i++]) -- don't duplicate it;
            // fall back to logging new value only, no oldval capture.
            decl << construct_var_assign(type, newVarName, rewrittenText)
                 << construct_expr_ev(*loc, type, newVarName);
        }
    }
    else
    {
        decl << construct_var_assign(type, newVarName, rewrittenText)
             << construct_expr_ev(*loc, type, newVarName);
    }

    pendingStmts.back().push_back(decl.str());

    // 3. replace the ENTIRE original text of this node with just the
    //    temp var name, so any ancestor's getRewrittenText() picks it up
    RW.ReplaceText(fullRange, newVarName);
    return true;
}

// Converts i++ to:
// int __ev0 = i;
// int __ev1 = i++;
// __var_change(...);

bool InstrumentVisitor::TraverseUnaryOperator(UnaryOperator *UO)
{
    if (!UO->isIncrementDecrementOp())
        return true;

    TraverseStmt(UO->getSubExpr());

    std::optional<Loc> loc = getLoc(UO->getBeginLoc(), UO->getEndLoc(), SM);
    if (!loc.has_value())
        return true;

    CharSourceRange fullRange = CharSourceRange::getTokenRange(UO->getSourceRange());
    std::string rewrittenText = RW.getRewrittenText(fullRange);
    std::string type = typeStr(UO->getType(), LO);
    std::string oldValName = genVarName();
    std::string newValName = genVarName();
    std::string name = exprText(UO->getSubExpr(), SM, LO);

    std::ostringstream decl;
    decl << construct_var_assign(type, oldValName, name)
         << rewrittenText << ";\n"
         << construct_var_assign(type, newValName, name)
         << construct_assign_ev(*loc, type, name, oldValName, newValName);

    pendingStmts.back().push_back(decl.str());
    RW.ReplaceText(fullRange, oldValName);
    return true;
}
