#include "include/construct_calls.hpp"

const std::string var_to_str(const std::string rtext)
{
    return "static_cast<std::string>(debug().noloc()," + rtext + ")";
}

void addCtx(
    std::ostringstream &os, const std::string &kind, Loc &loc)
{
    os << "__dbg_fmt_ctx(__dbg_ctx_id, \"" << kind << "\","
       << loc.start.line << "," << loc.start.col << ","
       << loc.end.line << "," << loc.end.col << ")";
}

const std::string construct_args(clang::FunctionDecl *FD)
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
        return "\"\"";

    for (const ParmVarDecl *P : FD->parameters())
    {
        if (P->getName().empty())
            continue;
        std::string name = P->getNameAsString();
        std::string type = typeStr(P->getType());
        os << "\"{name:" << escape(name) << ",type:" << escape(type) << ",val:\\\"\" +" << var_to_str(name) << "+\"\\\"}\"";
    }

    return os.str();
}

// int __func_enter(const std::string &file,
//                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
//                  const std::string &func, std::vector<Arg> args = {});
const std::string construct_func_enter(const std::string &file, Loc &loc, const std::string &func, clang::FunctionDecl *FD)
{
    std::ostringstream os;

    os << "std::string __dbg_ctx_id = __dbg_gen_id(\"" << escape(file) << "\");__func_enter(";
    addCtx(os, "enter", loc);
    os << ", \"" << escape(func) << "\","
       << construct_args(FD) << R_END;
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

    os << "__func_return(";
    addCtx(os, "return", loc);
    os << ",\"{type:" << escape(tname) << ",val:\\\"\"+" << var_to_str(rtext) << "+\"\\\"}\"" << R_END;
    return os.str();
}

// void __func_exit(int ctxId,
//                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol);
const std::string construct_func_exit(Loc &loc)
{
    std::ostringstream os;
    os << "__func_exit(";
    addCtx(os, "exit", loc);
    os << R_END;

    return os.str();
}
