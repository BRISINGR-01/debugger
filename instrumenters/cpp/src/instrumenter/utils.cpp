#include <mutex>
#include <string>
#include "./include/utils.hpp"
#include <clang/AST/ParentMapContext.h>

std::string escape(std::string s)
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

std::string typeStr(QualType qt, const LangOptions &LO)
{
    qt = qt.getUnqualifiedType();

    if (qt->isBooleanType())
    {
        if (LO.CPlusPlus)
            return "bool";
        else
            return "_Bool";
    }

    return qt.getAsString();
}

// Get the source text of an expression (may be empty on failure).
std::string exprText(const Expr *e, const SourceManager &SM,
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

std::optional<Loc> getLoc(SourceLocation start, SourceLocation end, const SourceManager &SM)
{
    if (start.isInvalid() || end.isInvalid() ||
        SM.isInSystemHeader(start) || SM.isInSystemHeader(end))
        return {};

    PresumedLoc p_start = SM.getPresumedLoc(start);
    if (p_start.isInvalid())
        return {};
    PresumedLoc p_end = SM.getPresumedLoc(end);
    if (p_end.isInvalid())
        return {};

    return Loc{
        .start = {.line = p_start.getLine(), .col = p_start.getColumn()},
        .end = {.line = p_end.getLine(), .col = p_end.getColumn()},
    };
}

bool shouldSkipFn(const std::string &funcName)
{
    if (funcName.starts_with("__dbg"))
        return true;

    return false;
}

std::string getLambdaVariableName(CXXMethodDecl *FD, ASTContext &Ctx)
{
    auto Parents = Ctx.getParents(*FD);

    while (!Parents.empty())
    {
        const clang::DynTypedNode &Parent = Parents[0];

        if (const auto *VD = Parent.get<VarDecl>())
            return VD->getNameAsString();

        if (const auto *FD2 = Parent.get<FunctionDecl>())
            break;

        auto Next = Ctx.getParents(Parent);
        if (Next.empty())
            break;

        Parents = Next;
    }

    return {};
}

// Uses Lexer to pull the exact original source text for an expr,
// needed since Expr nodes don't carry their spelling directly.
std::string exprStr(Expr *E, SourceManager &SM)
{
    CharSourceRange range = CharSourceRange::getTokenRange(E->getSourceRange());
    return Lexer::getSourceText(range, SM, LangOptions()).str();
}