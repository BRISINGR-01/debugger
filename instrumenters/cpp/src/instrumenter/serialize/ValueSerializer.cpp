#include "clang/AST/Decl.h"
#include "clang/AST/DeclCXX.h"
#include "clang/AST/DeclTemplate.h"
#include "clang/AST/PrettyPrinter.h"
#include "clang/Basic/SourceManager.h"
#include "iostream"

#include "./ValueSerializer.hpp"
#include "./json.hpp"
#include "utils.hpp"

ValueSerializer::ValueSerializer(const ASTContext &Ctx) : Ctx(Ctx)
{
  printerFns.insert("__dbg_bool");
  printerFns.insert("__dbg_char");
  printerFns.insert("__dbg_short");
  printerFns.insert("__dbg_int");
  printerFns.insert("__dbg_long");
  printerFns.insert("__dbg_long_long");
  printerFns.insert("__dbg_float");
  printerFns.insert("__dbg_double");
  printerFns.insert("__dbg_long_double");
  printerFns.insert("__dbg_cstr");
  printerFns.insert("__dbg_null");
  printerFns.insert("__dbg_unsupported");

  if (Ctx.getLangOpts().CPlusPlus)
  {
    printerFns.insert("__dbg_arr");
    printerFns.insert("__dbg_vector");
    printerFns.insert("__dbg_addr");
  }
}

bool ValueSerializer::isStd(QualType QT)
{
  QT = QT.getCanonicalType();
  const auto *RT = QT->getAs<RecordType>();
  if (!RT)
    return false;

  const RecordDecl *RD = RT->getDecl();
  if (const auto *NS = dyn_cast<NamespaceDecl>(RD->getDeclContext()))
    return NS->getName() == "std";

  return false;
}

/// Policy used when the printed type has to compile: keeps `struct`/`union`/
/// `enum` keywords in C, drops them in C++.
PrintingPolicy codePolicy(const ASTContext &Ctx)
{
  bool isCPP = Ctx.getLangOpts().CPlusPlus;
  PrintingPolicy PP = Ctx.getPrintingPolicy();
  PP.SuppressTagKeyword = isCPP;
  PP.AnonymousTagLocations = false;
  PP.PrintAsCanonical = true;
  PP.Bool = !isCPP;
  return PP;
}

// Key used to look up / name the printer. For template specializations
// (this covers std::vector, std::map, std::string==basic_string<char>,
// and any third-party or user template) we key off the TEMPLATE NAME,
// not the full instantiation — so vector<int> and vector<Foo> both
// resolve to "_dbg_vector".
const std::string ValueSerializer::recordPrinter(const RecordDecl *RD)
{
  if (auto *CTSD = dyn_cast<ClassTemplateSpecializationDecl>(RD))
    return dbgPrefix + sanitizeStr(
                           CTSD->getSpecializedTemplate()->getNameAsString());

  if (RD->getIdentifier() == nullptr)
  {
    if (const TypedefNameDecl *TD = RD->getTypedefNameForAnonDecl())
      return dbgPrefix + sanitizeStr(TD->getQualifiedNameAsString());

    // fully anonymous, no typedef -> fall back to a stable-ish
    // per-decl key; won't be human readable but avoids collisions
    return dbgPrefix + sanitizeStr(RD->getQualifiedNameAsString() +
                                   std::to_string(reinterpret_cast<uintptr_t>(RD)));
  }

  // plain struct/class (user or third-party, non-template):
  // qualify to avoid collisions between e.g. ns1::Foo and ns2::Foo
  return dbgPrefix + sanitizeStr(RD->getQualifiedNameAsString());
}

const std::string ValueSerializer::typeToStr(QualType QT)
{
  if (QT.isNull())
    return "null";
  QT = QT.getNonReferenceType();
  if (QT.isNull())
    return "null";
  QT = QT.getUnqualifiedType();
  if (QT.isNull())
    return "null";

  if (QT->isBooleanType())
    return Ctx.getLangOpts().CPlusPlus ? "bool" : "_Bool";

  return QT.getAsString();
}

bool ValueSerializer::printerExists(const std::string objectName)
{
  return printerFns.contains(sanitizeStr(objectName));
}

const std::string ValueSerializer::getPrinter(QualType type)
{
  type = type.getCanonicalType().getUnqualifiedType();
  std::cout << typeToStr(type) << std::endl;

  if (type->isReferenceType())
    return getPrinter(type->getPointeeType());

  if (type->isPointerType() || type->getAsArrayTypeUnsafe())
    return {}; // handled structurally in serialize(), not a simple name lookup

  if (const BuiltinType *BT = type->getAs<BuiltinType>())
  {
    switch (BT->getKind())
    {
    case BuiltinType::Void:
      return dbgPrefix + "void";
    case BuiltinType::Bool:
      return dbgPrefix + "bool";
    case BuiltinType::Char8:
    case BuiltinType::Char_S:
    case BuiltinType::Char_U:
    case BuiltinType::SChar:
    case BuiltinType::UChar:
      return dbgPrefix + "char";
    case BuiltinType::WChar_S:
    case BuiltinType::WChar_U:
    case BuiltinType::Short:
    case BuiltinType::UShort:
    case BuiltinType::ShortFract:
    case BuiltinType::UShortFract:
    case BuiltinType::ShortAccum:
    case BuiltinType::UShortAccum:
      return dbgPrefix + "short";
    case BuiltinType::Char16:
    case BuiltinType::Char32:
    case BuiltinType::Int:
    case BuiltinType::UInt:
    case BuiltinType::Fract:
    case BuiltinType::UFract:
    case BuiltinType::Accum:
    case BuiltinType::UAccum:
      return dbgPrefix + "int";
    case BuiltinType::Long:
    case BuiltinType::ULong:
    case BuiltinType::LongAccum:
    case BuiltinType::ULongAccum:
      return dbgPrefix + "long";
    case BuiltinType::LongLong:
    case BuiltinType::ULongLong:
    case BuiltinType::Int128:  // might not fit
    case BuiltinType::UInt128: // might not fit
    case BuiltinType::BitInt:  // might not fit
      return dbgPrefix + "long_long";
    case BuiltinType::Float:
    case BuiltinType::Half:
    case BuiltinType::Float16:
    case BuiltinType::BFloat16:
    case BuiltinType::LongFract:
    case BuiltinType::ULongFract:
      return dbgPrefix + "float";
    case BuiltinType::Double:
      return dbgPrefix + "double";
    case BuiltinType::Float128:
    case BuiltinType::LongDouble:
      return dbgPrefix + "long_double";
    case BuiltinType::NullPtr:
      return dbgPrefix + "null";
      // // Other Clang-specific builtin types
      // case BuiltinType::ObjCId:
      //   return dbgPrefix + "objc_id";

      // case BuiltinType::ObjCClass:
      //   return dbgPrefix + "objc_class";

      // case BuiltinType::ObjCSel:
      //   return dbgPrefix + "objc_sel";
    default:
      return dbgPrefix + "unsupported";
    }
  }

  if (const RecordDecl *RD = type->getAsRecordDecl())
    return recordPrinter(RD);

  if (const EnumType *ET = type->getAs<EnumType>())
    return dbgPrefix + sanitizeStr(ET->getDecl()->getQualifiedNameAsString());

  return dbgPrefix + "unsupported";
}

void ValueSerializer::registerIfPrinter(const FunctionDecl *FD)
{
  if (!FD)
    return;

  std::string func = FD->getNameAsString();
  if (!FD->isInlineSpecified() || !func.starts_with(dbgPrefix) || FD->getNumParams() != 1)
    return;

  QualType retType = FD->getReturnType();
  if (retType.isNull())
    return;
  retType = retType.getNonReferenceType();
  if (retType.isNull())
    return;
  retType = retType.getUnqualifiedType();
  if (retType.isNull())
    return;
  retType = retType.getCanonicalType();
  if (retType.isNull())
    return;
  const RecordDecl *returnRD = retType->getAsRecordDecl();
  if (!returnRD || returnRD->getName() != "basic_string")
    return;

  const RecordType *paramRT = FD->parameters()[0]->getType()->getAs<RecordType>();
  if (!paramRT)
    return;

  // check if param type is correct
  const RecordDecl *paramRD = paramRT->getDecl();
  if (recordPrinter(paramRD) != func)
    return;

  printerFns.insert(func);
}

const std::string ValueSerializer::constructStructPrinter(RecordDecl *RD, Rewriter &RW)
{
  std::string name = RD->getNameAsString();
  const std::string printer = recordPrinter(RD);
  printerFns.insert(printer);

  std::ostringstream fn;
  fn << "inline std::string " << printer << "(const " << name << " &v) {\n  return ";

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
  // Skip enums nested in uninstantiated templates: getQualifiedNameAsString()
  // may embed unresolved template parameter text there, which isn't valid
  // as a standalone type reference.
  if (ED->isTemplated() || ED->getDeclContext()->isDependentContext())
    return {};

  // --- resolve a name usable as a type reference (typeRefName) ---
  // and a name usable as a stable lookup/suffix key (keySource) ---
  std::string typeRefName;
  std::string keySource;

  if (ED->getIdentifier() != nullptr)
  {
    // Unqualified name is always safe to use as the type reference:
    // the generated printer lives in the same TU as ED, so normal
    // unqualified lookup finds it even inside an anonymous namespace
    // or nested scope (C++ resolves this positionally; qualifying
    // with "(anonymous namespace)::" is not valid syntax and unneeded).
    typeRefName = ED->getNameAsString();
    // Qualified name for the key: still unique across namespaces/
    // nested classes, and stable even if two anonymous namespaces in
    // different files both declare "Color".
    keySource = ED->getQualifiedNameAsString();
  }
  else if (const TypedefNameDecl *TD = ED->getTypedefNameForAnonDecl())
  {
    // typedef enum { ... } Foo;  (common in C, legal in C++ too)
    typeRefName = TD->getNameAsString();
    keySource = TD->getQualifiedNameAsString();
  }
  else
  {
    return {}; // genuinely anonymous, unnamed enum: no printer possible
  }

  std::string printer = dbgPrefix + "_" + sanitizeStr(keySource);

  // In C++11 unscoped/scoped enums both support `EnumName::Enumerator`
  // qualification, but plain C enums inject enumerators into the
  // enclosing scope unqualified — "Color::Red" is not valid C.
  bool qualifyEnumerators = Ctx.getLangOpts().CPlusPlus;

  std::ostringstream fn;
  fn << "static inline std::string " << printer << "(const " << typeRefName << " v) {\n  switch (v) {\n";

  for (const EnumConstantDecl *EC : ED->enumerators())
  {
    std::string enumeratorName = EC->getNameAsString();
    std::string caseLabel = qualifyEnumerators
                                ? (typeRefName + "::" + enumeratorName)
                                : enumeratorName;
    fn << "  case " << caseLabel << ": return \"" << enumeratorName << "\";\n";
  }

  fn << "  default: return __dbg_unsupported();\n} }\n";
  printerFns.insert(printer);
  return fn.str();
}

const std::string ValueSerializer::serialize(const std::string expr, QualType T)
{
  std::cout << typeToStr(T) << std::endl;
  if (T->isReferenceType())
    return serialize(expr, T->getPointeeType());

  if (const ArrayType *AT = T->getAsArrayTypeUnsafe())
  {
    QualType elemT = AT->getElementType().getUnqualifiedType();

    if (elemT->isCharType())
      return dbgPrefix + "cstr(" + expr + ")";

    std::string printer = getPrinter(elemT);
    if (!printerExists(printer))
      return "\"<" + typeToStr(T) + ">\"";

    std::string elemSize = "sizeof(" + typeToStr(elemT) + ")";

    if (const auto *CAT = dyn_cast<ConstantArrayType>(AT))
    {
      llvm::SmallString<32> size;
      CAT->getSize().toString(size, /*Radix=*/10, /*Signed=*/false);
      return dbgPrefix + "arr(" + expr + ", " + elemSize + ", " + size.str().str() + ", " + printer + ")";
    }

    if (isa<VariableArrayType>(AT))
    {
      std::string size = "(sizeof(" + expr + ") / sizeof((" + expr + ")[0]))";
      return dbgPrefix + "arr(" + expr + ", " + elemSize + ", " + size + ", " + printer + ")";
    }

    return "\"<" + typeToStr(T) + ">\"";
  }

  if (T->isPointerType())
  {
    QualType pointee = T->getPointeeType().getUnqualifiedType();
    if (pointee->isCharType())
      return dbgPrefix + "cstr(" + expr + ")";

    if (pointee->isFunctionType())
      return "\"" + escape(typeToStr(pointee)) + "\"";

    if (pointee->isVoidType())
      return dbgPrefix + "addr(" + expr + ")";

    return "(" + expr + " ? " + serialize("*(" + expr + ")", pointee) + " : \"null\")";
  }

  if (const EnumType *ET = T->getAs<EnumType>())
  {
    const std::string name = sanitizeStr(ET->getDecl()->getQualifiedNameAsString());
    const std::string printer = dbgPrefix + name;
    if (printerExists(printer))
      return printer + "(" + expr + ")";

    // no dedicated enum printer -> fall back to underlying integer type
    QualType underlying = ET->getDecl()->getIntegerType();
    if (underlying.isNull())
      return "\"" + name + ":<unresolved>\"";

    return serialize("static_cast<" + underlying.getAsString() + ">(" + expr + ")",
                     underlying);
  }

  if (const RecordType *RT = T->getAs<RecordType>())
  {
    std::string printer = recordPrinter(RT->getDecl());
    if (printerExists(printer))
      return printer + "(" + expr + ")";

    return "\"<" + typeToStr(T) + ">\"";
  }

  const std::string printer = getPrinter(T);
  if (printerExists(printer))
    return printer + "(" + expr + ")";

  return "\"<" + typeToStr(T) + ">\"";
}