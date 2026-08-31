#pragma once
#include <sstream>

#include "./utils.hpp"

const std::string construct_func_enter_ev(const std::string &file, Loc &loc, const std::string &func, clang::FunctionDecl *FD, const LangOptions &LO);
const std::string construct_func_return_ev(Loc &loc, ReturnStmt *RS, clang::SourceManager &SM, const clang::LangOptions &LO);
const std::string construct_func_exit_ev(Loc &loc);

const std::string construct_var_assign(const std::string type, const std::string name, const std::string expr);

const std::string construct_assign_ev(Loc &loc, const std::string type, const std::string name, const std::string oldVarName, const std::string tmpVarName);
const std::string construct_var_decl_ev(Loc &loc, VarDecl *VD, const LangOptions &LO);
const std::string construct_expr_ev(Loc &loc, const std::string type, const std::string tmpVarName);
