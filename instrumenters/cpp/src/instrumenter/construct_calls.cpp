#include "include/construct_calls.hpp"

const std::string to_dbg_str(const std::string rtext)
{
    return "__DBG(" + rtext + ")";
}

void addCtx(
    std::ostringstream &os, const std::string &kind, Loc &loc)
{
    os << "__dbg_fmt_ctx(__dbg_ctx_id, \"" << kind << "\","
       << loc.start.line << "," << loc.start.col << ","
       << loc.end.line << "," << loc.end.col << ")";
}

int construct_args(std::ostringstream &os, clang::FunctionDecl *FD, const SourceManager &SM, const LangOptions &LO)
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
        std::string type = typeStr(P->getType(), LO);

        auto loc = getLoc(P->getBeginLoc(), Lexer::getLocForEndOfToken(P->getEndLoc(), 0, SM, LO), SM);
        if (!loc.has_value())
            continue;

        os << "{\""
           << escape(name) << "\",\""
           << escape(type) << "\","
           << to_dbg_str(name) << ","
           << std::to_string(loc->start.line) << ","
           << std::to_string(loc->start.col) << ","
           << std::to_string(loc->end.line) << ","
           << std::to_string(loc->end.col)
           << "},";
    }

    os << "};\n";

    return args_count;
}

const std::string construct_func_enter_ev(const std::string &file, Loc &loc, const std::string &func, clang::FunctionDecl *FD, const SourceManager &SM, const LangOptions &LO)
{
    std::ostringstream os;
    int args_count = construct_args(os, FD, SM, LO);
    os << "std::string __dbg_ctx_id = __dbg_gen_id(\"" << escape(file) << "\", " + std::to_string(loc.start.line) + ");\n"
       << "__func_enter(";
    addCtx(os, "enter", loc);
    os << ", \"" << escape(func) << "\", __dbg_args, " << std::to_string(args_count) << ");\n";
    return os.str();
}

const std::string construct_func_return_ev(Loc &loc, ReturnStmt *RS, clang::SourceManager &SM, const clang::LangOptions &LO)
{
    Expr *retVal = RS->getRetValue();
    if (!retVal)
        return construct_func_exit_ev(loc);
    std::string rtext = exprText(retVal, SM, LO);
    if (rtext.empty())
        return construct_func_exit_ev(loc);

    std::string tname = typeStr(retVal->getType(), LO);
    std::ostringstream os;

    os << "__func_return(";
    addCtx(os, "exit", loc);
    os << ",\"" << escape(tname) << "\"," << to_dbg_str(rtext) << ");\n";
    return os.str();
}

const std::string construct_func_exit_ev(Loc &loc)
{
    std::ostringstream os;
    os << "__func_exit(";
    addCtx(os, "exit", loc);
    os << ");\n";

    return os.str();
}

const std::string construct_var_decl_ev(Loc &loc, VarDecl *VD, const LangOptions &LO)
{

    std::string name = VD->getNameAsString();
    std::string type = typeStr(VD->getType(), LO);

    std::ostringstream os;
    os << "__var_decl(";
    addCtx(os, "declare", loc);
    os << ", \"" << name << "\", \"" << type << "\", " << to_dbg_str(name) << ");\n";

    return os.str();
}

const std::string construct_var_assign(const std::string type, const std::string name, const std::string expr)
{
    return type + " " + name + " = " + expr + ";\n";
}

const std::string construct_expr_ev(Loc &loc, const std::string type, const std::string tmpVarName)
{
    std::ostringstream os;
    os << "__expr(";
    addCtx(os, "expr", loc);
    os << ", \"" << type << "\", " << to_dbg_str(tmpVarName) << ");\n";

    return os.str();
}

const std::string construct_assign_ev(Loc &loc, const std::string type, const std::string name, const std::string oldVarName, const std::string tmpVarName)
{
    std::ostringstream os;
    os << "__var_change(";
    addCtx(os, "change", loc);
    os << ", \"" << name << "\", \"" << type << "\", " << to_dbg_str(tmpVarName) << ", " << to_dbg_str(oldVarName) << ");\n";

    return os.str();
}