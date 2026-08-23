#include "./include/utils.hpp"

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

std::string typeStr(QualType qt)
{
    return escape(qt.getUnqualifiedType().getAsString());
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
    if (start.isInvalid() || end.isInvalid())
        return {};
    PresumedLoc p_start = SM.getPresumedLoc(start);
    if (p_start.isInvalid())
        return {};
    PresumedLoc p_end = SM.getPresumedLoc(start);
    if (p_end.isInvalid())
        return {};

    return Loc{
        .start = {.line = p_start.getLine(), .col = p_start.getColumn()},
        .end = {.line = p_end.getLine(), .col = p_end.getColumn()},
    };
}
