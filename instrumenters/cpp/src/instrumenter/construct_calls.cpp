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

int construct_args(
    std::ostringstream &os, clang::FunctionDecl *FD)
{
    int args_count = 0;
    for (const ParmVarDecl *P : FD->parameters())
    {
        if (!P->getName().empty())
            args_count++;
    }

    os << "struct __dbg_Fn_arg __dbg_args[" + std::to_string(args_count) + "] = {";

    for (const ParmVarDecl *P : FD->parameters())
    {
        if (P->getName().empty())
            continue;
        std::string name = P->getNameAsString();
        std::string type = typeStr(P->getType());
        os << "{\"" << escape(name) << "\",\"" << escape(type) << "\"," << var_to_str(name) << "},";
    }

    os << "};\n";

    return args_count;
}

// int __func_enter(const std::string &file,
//                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
//                  const std::string &func, std::vector<Arg> args = {});
const std::string construct_func_enter(const std::string &file, Loc &loc, const std::string &func, clang::FunctionDecl *FD)
{
    std::ostringstream os;
    int args_count = construct_args(os, FD);
    os << "std::string __dbg_ctx_id = __dbg_gen_id(\"" << escape(file) << "\");\n"
       << "__func_enter(";
    addCtx(os, "enter", loc);
    os << ", \"" << escape(func) << "\", __dbg_args, " << std::to_string(args_count) << ");\n";
    return os.str();
}

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
    addCtx(os, "exit", loc);
    os << ",\"" << escape(tname) << "\"," << var_to_str(rtext) << ");\n";
    return os.str();
}

// void __func_exit(int ctxId,
//                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol);
const std::string construct_func_exit(Loc &loc)
{
    std::ostringstream os;
    os << "__func_exit(";
    addCtx(os, "exit", loc);
    os << ");\n";

    return os.str();
}
