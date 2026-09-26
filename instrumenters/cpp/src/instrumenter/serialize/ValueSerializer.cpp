#include "clang/AST/Decl.h"
#include "clang/AST/DeclCXX.h"
#include "clang/AST/PrettyPrinter.h"
#include "clang/Basic/SourceManager.h"
#include "iostream"

#include "./ValueSerializer.hpp"
#include "./json.hpp"

ValueSerializer::ValueSerializer(const ASTContext &Ctx, bool isC) : Ctx(Ctx), isC(isC) {}

/// Policy used when the printed type has to compile: keeps `struct`/`union`/
/// `enum` keywords in C, drops them in C++.
PrintingPolicy codePolicy(const ASTContext &Ctx, bool IsC)
{
  PrintingPolicy PP = Ctx.getPrintingPolicy();
  PP.SuppressTagKeyword = !IsC;
  PP.AnonymousTagLocations = false;
  PP.PrintAsCanonical = true;
  PP.Bool = false; // print _Bool, which is valid in both languages
  return PP;
}

/// Policy used for identifier synthesis only.
PrintingPolicy namePolicy(const ASTContext &Ctx)
{
  PrintingPolicy PP = Ctx.getPrintingPolicy();
  PP.SuppressTagKeyword = true;
  PP.AnonymousTagLocations = false;
  PP.PrintAsCanonical = true;
  return PP;
}

const std::string ValueSerializer::typeToStr(QualType QT)
{
  if (QT.isNull())
    return "null";
  QualType nr = QT.getNonReferenceType();
  if (nr.isNull())
    return "null";
  QualType c = nr.getCanonicalType();
  if (c.isNull())
    return "null";
  QualType type = c.getUnqualifiedType();
  if (type.isNull())
    return "null";

  return type.getAsString(namePolicy(Ctx));
}

const std::string ValueSerializer::sanitizeType(QualType QT)
{

  if (QT.isNull())
    return "null";
  QualType nr = QT.getNonReferenceType();
  if (nr.isNull())
    return "null";
  QualType c = nr.getCanonicalType();
  if (c.isNull())
    return "null";
  QualType type = c.getUnqualifiedType();
  if (type.isNull())
    return "null";

  std::string Name;
  const TagDecl *TD = type->getAsTagDecl();
  if (TD && !TD->getIdentifier() && !TD->getTypedefNameForAnonDecl())
  {
    PresumedLoc PL = Ctx.getSourceManager().getPresumedLoc(TD->getLocation());
    Name = "anon_";
    if (PL.isValid())
    {
      StringRef F(PL.getFilename());
      size_t Slash = F.find_last_of("/\\");
      Name += (Slash == StringRef::npos ? F : F.substr(Slash + 1)).str();
      Name += "_" + std::to_string(PL.getLine()) + "_" +
              std::to_string(PL.getColumn());
    }
  }
  else
  {
    Name = type.getAsString(namePolicy(Ctx));
  }

  std::string Out;
  bool LastUnderscore = false;
  for (char c : Name)
  {
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c == '_')
    {
      Out += c;
      LastUnderscore = (c == '_');
    }
    else if (!LastUnderscore)
    {
      Out += '_';
      LastUnderscore = true;
    }
  }
  while (!Out.empty() && Out.back() == '_')
    Out.pop_back();
  if (Out.empty())
    Out = "unnamed";
  if (Out[0] >= '0' && Out[0] <= '9')
    Out.insert(Out.begin(), '_');
  return Out;
}

bool ValueSerializer::hasPrinter(const std::string &objectName)
{
  return objectsWithPrinter.contains(objectName);
}

const std::string ValueSerializer::constructStructPrinter(RecordDecl *RD, Rewriter &RW)
{
  std::string name = RD->getNameAsString();

  std::ostringstream fn;
  fn << "static inline std::string " << dbgToken << "_" << name << "(const " << name << " &v) {\n  return ";
  jsonStr json;

  for (const FieldDecl *FD : RD->fields())
  {
    std::string name = FD->getNameAsString();
    std::string accessExpr = "v." + name;
    if (FD->isBitField())
      accessExpr = "(long long)(" + accessExpr + ")";

    json.addKeyVal(name, serialize(accessExpr, FD->getType()));
  }
  fn << json.str() << ";";

  return fn.str();
}

const std::string ValueSerializer::constructEnumPrinter(EnumDecl *ED, Rewriter &RW)
{
  std::string name = ED->getNameAsString();
  std::ostringstream fn;
  fn << "static inline std::string " << dbgToken << "_" << name << "(const " << name << " &v) {\n";

  fn << "  switch(v) {";
  std::cout << name << std::endl;
  for (clang::EnumConstantDecl *i : ED->enumerators())
  {
    std::cout << i->getNameAsString() << std::endl;
  }

  fn << "};\n}";

  return fn.str();
}

const std::string ValueSerializer::serialize(const std::string expr, QualType type)
{
  std::cout << expr << std::endl;
  std::cout << type.getAsString() << std::endl;
  std::cout << typeToStr(type) << std::endl;
  return type.getAsString();
}