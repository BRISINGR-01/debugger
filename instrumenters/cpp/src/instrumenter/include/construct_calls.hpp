#pragma once
#include <sstream>

#include "utils.hpp"
#include "serialize/ValueSerializer.hpp"

const std::string construct_func_enter_ev(const std::string &file, Loc &loc, const std::string &func, clang::FunctionDecl *FD, const SourceManager &SM, const LangOptions &LO, ValueSerializer &serializer);
const std::string construct_func_return_ev(Loc &loc, ReturnStmt *RS, clang::SourceManager &SM, const clang::LangOptions &LO, ValueSerializer &serializer);
const std::string construct_func_exit_ev(Loc &loc);

const std::string construct_var_assign(const QualType type, const std::string name, const std::string expr, ValueSerializer &serializer);

const std::string construct_assign_ev(Loc &loc, const QualType type, const std::string name, const std::string oldVarName, const std::string tmpVarName, ValueSerializer &serializer);
const std::string construct_var_decl_ev(Loc &loc, VarDecl *VD, ValueSerializer &serializer);
const std::string construct_expr_ev(Loc &loc, const QualType type, const std::string tmpVarName, ValueSerializer &serializer);