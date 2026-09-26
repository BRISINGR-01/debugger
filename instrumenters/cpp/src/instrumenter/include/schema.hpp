#include "clang/AST/ASTContext.h"
#include "clang/AST/Decl.h"
#include "clang/AST/DeclCXX.h"
#include "clang/AST/RecordLayout.h"
#include "clang/AST/Type.h"
#include <iostream>
#include <string>
#include <nlohmann/json.hpp>
using json = nlohmann::json;

json recordSchema(const clang::ASTContext &Ctx, const clang::RecordDecl *RD);

json recordSchema(const clang::ASTContext &Ctx, const clang::RecordDecl *RD,
                  uint64_t baseOffsetBytes,
                  const std::string &pathPrefix);
