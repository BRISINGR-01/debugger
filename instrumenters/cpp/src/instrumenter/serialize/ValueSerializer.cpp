#include "clang/AST/Decl.h"
#include "clang/AST/DeclCXX.h"
#include "clang/AST/DeclTemplate.h"
#include "clang/AST/PrettyPrinter.h"
#include "clang/Basic/SourceManager.h"
#include "iostream"

#include "./ValueSerializer.hpp"
#include "./json.hpp"
#include "utils.hpp"

ValueSerializer::ValueSerializer(const ASTContext &Ctx, Rewriter &RW) : Ctx(Ctx), RW(RW)
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

const std::string ValueSerializer::typeToStr(QualType QT, bool pretty)
{
  if (!pretty)
  {
    QT = QT.getCanonicalType();
    if (QT.isNull())
      return "null";
  }

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

bool ValueSerializer::printerExists(const std::string printer)
{
  return !printer.empty() && printerFns.contains(sanitizeStr(printer));
}

const std::string ValueSerializer::getPrinter(QualType type)
{
  type = type.getCanonicalType().getUnqualifiedType();

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

void ValueSerializer::constructStructPrinter(RecordDecl *RD, Rewriter &RW)
{
  const DeclContext *DC = RD->getDeclContext();
  if (DC->isFunctionOrMethod())
    return;

  const RecordDecl *Outer = RD;
  while (const auto *P = dyn_cast<RecordDecl>(Outer->getDeclContext()))
    Outer = P;

  SourceLocation end = Outer->getEndLoc(); // the closing '}'
  if (end.isInvalid() || end.isMacroID())
    return; // can't rewrite reliably

  // step past the ';' (or a declarator: `struct {..} foo;`)
  SourceLocation after = Lexer::findLocationAfterToken(
      end, tok::semi, Ctx.getSourceManager(), Ctx.getLangOpts(),
      /*SkipTrailingWhitespaceAndNewLine=*/true);
  if (after.isInvalid())
    return;

  const std::string printer = recordPrinter(RD);
  if (!printerFns.insert(printer).second)
    return;

  // Nested types need qualification relative to the insertion scope:
  // after the outer record we are in the outer's enclosing namespace, so
  // "Outer::Inner" is correct; for top-level records it is just the name.
  std::string typeRef = RD->getName().str();
  for (const auto *P = dyn_cast<RecordDecl>(RD->getDeclContext()); P;
       P = dyn_cast<RecordDecl>(P->getDeclContext()))
    typeRef = P->getName().str() + "::" + typeRef;

  const bool isCXX = Ctx.getLangOpts().CPlusPlus;
  std::string param = isCXX ? "const " + typeRef + " &v"
                            : "const " + typeRef + " *pv"; // C: no refs
  std::string self = isCXX ? "v." : "pv->";

  jsonStr json;
  for (const FieldDecl *FD : RD->fields())
  {
    if (FD->getIdentifier() == nullptr)
      continue; // anonymous struct/union member
    std::string fname = FD->getNameAsString();
    std::string access = self + fname;
    if (FD->isBitField())
      access = "(long long)(" + access + ")";
    json.addKeyVal(fname, serialize(access, FD->getType()));
  }

  std::ostringstream fn;
  fn << "\nstatic inline std::string " << printer << "(" << param << ")\n{\n"
     << "  return " << json.str() << ";\n}\n";

  RW.InsertTextAfter(after, fn.str());
}

void ValueSerializer::constructEnumPrinter(EnumDecl *ED, Rewriter &RW)
{
  // enums in uninstantiated templates or function-local scopes: skip
  // (can't define a free function inside a function; dependent names aren't writable)
  const DeclContext *DC = ED->getDeclContext();
  if (DC->isFunctionOrMethod() || DC->isDependentContext())
    return;

  // --- names ---
  std::string typeRef, keySource;
  if (ED->getIdentifier())
  {
    typeRef = ED->getName().str();
    keySource = ED->getQualifiedNameAsString();
  }
  else if (const TypedefNameDecl *TD = ED->getTypedefNameForAnonDecl())
  {
    typeRef = TD->getName().str();
    keySource = TD->getQualifiedNameAsString();
  }
  else
    return;

  // Enclosing records: qualify relative to the insertion scope, which is
  // the scope containing the OUTERMOST record (or the enum itself if top-level).
  const RecordDecl *Outer = nullptr;
  for (const DeclContext *P = ED->getDeclContext(); P; P = P->getParent())
    if (const auto *R = dyn_cast<RecordDecl>(P))
      Outer = R; // keeps walking up; ends at outermost

  std::string qualifier; // "Outer::Mid::"
  for (const DeclContext *P = ED->getDeclContext(); P; P = P->getParent())
    if (const auto *R = dyn_cast<RecordDecl>(P))
      qualifier = R->getName().str() + "::" + qualifier;
  if (!Outer && !ED->getIdentifier())
    qualifier.clear();
  std::string fullRef = qualifier + typeRef;

  // A private enum nested in a class can't be named from a free function.
  if (Outer && ED->getAccess() != AS_public && ED->getAccess() != AS_none)
    return;

  // --- insertion point ---
  const Decl *anchor = Outer ? static_cast<const Decl *>(Outer)
                             : static_cast<const Decl *>(ED);
  SourceLocation end = anchor->getEndLoc();
  if (end.isInvalid() || end.isMacroID())
    return;
  SourceLocation after = Lexer::findLocationAfterToken(
      end, tok::semi, Ctx.getSourceManager(), Ctx.getLangOpts(), true);
  if (after.isInvalid())
    return;

  // --- dedupe / register ---
  const std::string printer = dbgPrefix + sanitizeStr(keySource);
  if (!printerFns.insert(printer).second)
    return;

  // --- body ---
  const bool isCXX = Ctx.getLangOpts().CPlusPlus;
  // Reference form is valid for both scoped and unscoped enums in C++11+;
  // C has no `::`, and enumerators live in the enclosing scope.
  // Enumerators of a C++ enum nested in a class are qualified by the class,
  // not the enum, for unscoped enums, so both spellings are covered by
  // qualifying with the enum name (valid since C++11).
  std::ostringstream fn;
  fn << "\nstatic inline std::string " << printer << "(" << fullRef << " v)\n{\n"
     << "  switch (v)\n    {\n";

  for (const EnumConstantDecl *EC : ED->enumerators())
  {
    std::string n = EC->getNameAsString();
    std::string label = isCXX ? (fullRef + "::" + n) : n;
    fn << "  case " << label << ": return \"\\\"" << label << "\\\"\";\n";
  }

  fn << "  default: return __dbg_unsupported();\n    }\n}\n";

  RW.InsertTextAfter(after, fn.str());
}

const std::string ValueSerializer::serialize(const std::string expr, QualType T)
{
  if (T->isReferenceType())
    return serialize(expr, T->getPointeeType());

  const std::string unsupported = "\"\\\"<" + typeToStr(T) + ">\\\"\"";

  static constexpr uint64_t kMaxUnrolled = 16; // cap generated code size

  if (const ArrayType *AT = T->getAsArrayTypeUnsafe())
  {
    QualType elemT = AT->getElementType();

    // char[N] is a string; char[N][M] recurses below as an array of strings
    if (elemT.getCanonicalType().getUnqualifiedType()->isCharType())
      return dbgPrefix + "cstr(" + expr + ")";

    const auto *CAT = dyn_cast<ConstantArrayType>(AT);
    if (!CAT)
    {
      if (!isa<VariableArrayType>(AT))
        return unsupported;

      static unsigned tmpId = 0;
      const std::string id = std::to_string(tmpId++);
      const std::string n = "__dbg_n" + id;
      const std::string sh = "__dbg_s" + id;
      const std::string i = "__dbg_i" + id;
      const std::string out = "__dbg_o" + id;
      const std::string cap = std::to_string(kMaxUnrolled);

      return "({ size_t " + n + " = sizeof(" + expr + ") / sizeof((" + expr + ")[0]); size_t " +
             sh + " = " + n + " < " + cap + " ? " + n + " : " + cap + "; std::string " +
             out + " = \"[\"; for (size_t " + i + " = 0; " + i + " < " + sh + "; ++" + i + ") { if (" +
             i + ") " + out + " += \", \"; " + out + " += " +
             serialize("(" + expr + ")[" + i + "]", elemT) + "; }  if (" +
             n + " > " + sh + ") " + out + " += (" + sh + " ? \", ...\" : \"...\"); " +
             out + " += \"]\"; " + out + "; })";
    }

    uint64_t total = CAT->getSize().getZExtValue();
    uint64_t shown = std::min(total, kMaxUnrolled);

    std::string call = dbgPrefix + "arr(" + std::to_string(total) + ", " +
                       std::to_string(shown);
    for (uint64_t i = 0; i < shown; ++i)
      call += ", " + serialize("(" + expr + ")[" + std::to_string(i) + "]", elemT);
    return call + ")";
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
    const EnumDecl *ED = ET->getDecl()->getDefinition();
    if (ED && !printerExists(printer))
      constructEnumPrinter(const_cast<EnumDecl *>(ED), RW); // builds + registers

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

    return unsupported;
  }

  const std::string printer = getPrinter(T);
  if (printerExists(printer))
    return printer + "(" + expr + ")";

  return unsupported;
}