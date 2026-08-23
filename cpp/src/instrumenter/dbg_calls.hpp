#pragma once
#include <sstream>

#include "./utils.hpp"

const std::string construct_func_enter(const std::string &file, Loc &loc, const std::string &func, clang::FunctionDecl *FD);
const std::string construct_func_return(Loc &loc, ReturnStmt *RS, clang::SourceManager &SM, const clang::LangOptions &LO);
const std::string construct_func_exit(Loc &loc);