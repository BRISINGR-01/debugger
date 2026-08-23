#include "include/construct_calls.hpp"

void addLoc(
    std::ostringstream &os, Loc &loc)
{
    os
        << loc.start.line << ", " << loc.start.col << ", "
        << loc.end.line << ", " << loc.end.col;
}

// int __func_enter(const std::string &file,
//                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
//                  const std::string &func, std::vector<Arg> args = {});
const std::string construct_func_enter(const std::string &file, Loc &loc, const std::string &func)
{
    std::ostringstream os;

    os << "int __dbg_ctx_id = __func_enter(\"" << escape(file) << "\", ";
    addLoc(os, loc);
    os << ", \"" << escape(func) << '"' << R_END;
    return os.str();
}

const std::string constructArgs(clang::FunctionDecl *FD)
{
    std::ostringstream os;

    bool hasParams = false;
    for (const ParmVarDecl *P : FD->parameters())
    {
        if (!P->getName().empty())
        {
            hasParams = true;
            break;
        }
    }

    if (!hasParams)
    {
        os << R_END;
        return os.str();
    }

    os << ",\n    std::vector<Arg>{\n";
    bool first = true;
    for (const ParmVarDecl *P : FD->parameters())
    {
        if (P->getName().empty())
            continue;
        if (!first)
            os << ",\n";
        first = false;
        // constructArg(os, P);
        std::string name = P->getNameAsString();
        std::string type = typeStr(P->getType());
        os << "      Arg{\"" << escape(name) << "\", "
           << "ValueSnapshot::from(" << name << ", \""
           << type << "\")}";
    }
    os << "\n    }";

    return os.str();
}

// void __func_return(int ctxId,
//                    u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
//                    std::string returnVal);
const std::string construct_func_return(Loc &loc, ReturnStmt *RS, clang::SourceManager &SM, const clang::LangOptions &LO)
{
    Expr *retVal = RS->getRetValue();
    if (!retVal)
        return construct_func_exit(loc);
    std::string rtext = exprText(retVal, SM, LO);
    if (rtext.empty())
        return construct_func_exit(loc);

    std::string tname = typeStr(retVal->getType());
    std::ostringstream os;

    os << "__func_return(__dbg_ctx_id, ";
    addLoc(os, loc);
    os << ", " << rtext << R_END;
    return os.str();
}

// void __func_exit(int ctxId,
//                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol);
const std::string construct_func_exit(Loc &loc)
{
    std::ostringstream os;
    os << "__func_exit(__dbg_ctx_id, ";
    addLoc(os, loc);
    os << R_END;

    return os.str();
}
