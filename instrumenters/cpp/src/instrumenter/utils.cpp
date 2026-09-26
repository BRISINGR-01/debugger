#include <mutex>
#include <string>
#include <fstream>
#include <clang/AST/ParentMapContext.h>

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
    qt = qt.getUnqualifiedType().getNonReferenceType();

    if (qt->isBooleanType())
    {
        return "short";
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

std::string read_file(std::filesystem::path path)
{
    constexpr auto read_size = std::size_t{4096};
    auto stream = std::ifstream{path};
    stream.exceptions(std::ios_base::badbit);

    if (!stream.is_open())
    {
        std::cerr << "Error opening \"" << path << '"' << std::endl;
        exit(1);
    }

    auto out = std::string{};
    auto buf = std::string(read_size, '\0');
    while (stream.read(&buf[0], read_size))
    {
        out.append(buf, 0, stream.gcount());
    }
    out.append(buf, 0, stream.gcount());
    return out;
}

const std::vector<std::string> numbers{"_Bool", "bool", "char", "short", "int", "long", "float", "double"};
const DebugType typeFromStr(const std::string type)
{
    if (std::count(numbers.cbegin(), numbers.cend(), type) != 0)
    {
        return DebugType::Number;
    }
    if (type == "void")
        return DebugType::Void;

    if (type == "std::string")
        return DebugType::String;

    std::cout << type << std::endl;
    return DebugType::Unknown;
}