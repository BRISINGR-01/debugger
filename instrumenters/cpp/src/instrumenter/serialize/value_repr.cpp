#include "value_repr.h"

using namespace clang;

namespace vtrace
{
  namespace
  {

    /// True if the type can be written out in source at all. Unnamed records with
    /// no typedef name print as "struct (unnamed at foo.c:12)", which won't build.
    bool isNameable(QualType C)
    {
      if (const TagDecl *TD = C->getAsTagDecl())
        return TD->getIdentifier() != nullptr ||
               TD->getTypedefNameForAnonDecl() != nullptr;
      return true;
    }

    std::string typeText(QualType C, const ASTContext &Ctx, bool IsC)
    {
      return C.getAsString(codePolicy(Ctx, IsC));
    }

    /// "const int (*name)[4]" -- clang places the declarator name correctly even
    /// for array- and function-pointer types, which string concatenation cannot.
    std::string declText(QualType T, const std::string &Name,
                         const ASTContext &Ctx, bool IsC)
    {
      std::string Out = Name;
      T.getAsStringInternal(Out, codePolicy(Ctx, IsC));
      return Out;
    }

    bool isPlainChar(const BuiltinType *BT)
    {
      return BT->getKind() == BuiltinType::Char_S ||
             BT->getKind() == BuiltinType::Char_U;
    }

    std::string escLit(const std::string &S)
    {
      std::string Out = "\"";
      for (char c : S)
      {
        if (c == '"' || c == '\\')
          Out += '\\';
        Out += c;
      }
      Out += '"';
      return Out;
    }

  } // namespace

  // ---------------------------------------------------------------------------

  ReprOptions makeOptionsFor(const ASTContext &Ctx)
  {
    ReprOptions O;
    O.isC = !Ctx.getLangOpts().CPlusPlus;
    return O;
  }

  std::string emitRepr(const std::string &Expr, QualType QT, ASTContext &Ctx,
                       const ReprOptions &O, unsigned Depth)
  {
    const std::string S = O.sinkVar;
    const std::string RT = O.rt;
    const std::string P = "(" + Expr + ")";
    const std::string UID = std::to_string(O.uidBase + Depth);

    auto literal = [&](const std::string &Text)
    {
      return RT + "lit(" + S + ", " + escLit(Text) + ");";
    };
    auto call1 = [&](const std::string &Fn, const std::string &Arg)
    {
      return RT + Fn + "(" + S + ", " + Arg + ");";
    };

    if (QT.isNull())
      return literal("<null-type>");
    if (Depth > O.maxDepth)
      return literal("<depth>");

    QT = QT.getNonReferenceType();
    QualType C = QT.getCanonicalType();
    if (const auto *AT = C->getAs<AtomicType>())
      C = AT->getValueType();
    const bool IsVolatile = C.isVolatileQualified();
    C = C.getUnqualifiedType();

    if (C->isVoidType())
      return literal("void");
    if (C->isDependentType() || C->isInstantiationDependentType() ||
        C->isUndeducedType())
      return literal("<dependent>");
    if (C->isNullPtrType())
      return call1("null", "").substr(0, 0) + RT + "null(" + S + ");";

    // ---------------------------------------------------------------- records
    if (C->isRecordType())
    {
      // std::string / std::string_view are the one C++ container worth special
      // casing; everything else goes through a generated __struct printer.
      if (!O.isC)
      {
        if (const auto *RD = C->getAsCXXRecordDecl())
        {
          StringRef N = RD->getName();
          if (N == "basic_string" || N == "basic_string_view")
            return RT + "cstrn(" + S + ", " + P + ".data(), " + P + ".size());";
        }
      }

      const std::string SN = sanitizeTypeName(C, Ctx);
      if (O.hasStructPrinter && !O.hasStructPrinter(SN, C))
        return literal("<" + SN + ">");
      if (!O.exprIsLValue && O.isC)
        return literal("<" + SN + ":rvalue>"); // cannot take its address
      if (O.requestStructPrinter)
        O.requestStructPrinter(SN, C);

      std::string Addr = "&" + P;
      if (IsVolatile && isNameable(C))
        Addr = "(const " + typeText(C, Ctx, O.isC) + " *)" + Addr;
      return SN + O.dbgPrefix + "(" + S + ", " + Addr + ");";
    }

    // ------------------------------------------------------------------ enums
    if (C->isEnumeralType())
    {
      const std::string SN = sanitizeTypeName(C, Ctx);
      if (O.hasEnumPrinter && O.hasEnumPrinter(SN, C))
        return SN + O.dbgPrefix + "(" + S + ", " + P + ");";
      return call1("i64f", "(vt_i64)" + P);
    }

    // --------------------------------------------------------------- builtins
    if (const auto *BT = C->getAs<BuiltinType>())
    {
      if (BT->getKind() == BuiltinType::Bool)
        return call1("bool", "(int)" + P);
      if (isPlainChar(BT))
        return call1("char", "(char)" + P);
      if (BT->isFloatingPoint())
        return call1("f64", "(double)" + P);
      if (BT->isInteger())
      {
        if (C->isUnsignedIntegerType())
          return call1("u64f", "(vt_u64)" + P);
        return call1("i64f", "(vt_i64)" + P);
      }
      return literal("<builtin>");
    }

    // --------------------------------------------------------------- pointers
    if (const auto *PT = C->getAs<PointerType>())
    {
      QualType Pointee = PT->getPointeeType();
      QualType PC = Pointee.getCanonicalType().getUnqualifiedType();

      if (PC->isFunctionType())
        return call1("fnptr", "(vt_fnptr_t)" + P);

      if (const auto *BT = PC->getAs<BuiltinType>())
        if (isPlainChar(BT))
          return call1("cstr", "(const char *)" + P);

      if (O.followRecordPointers && PC->isRecordType() && isNameable(PC))
      {
        const std::string SN = sanitizeTypeName(PC, Ctx);
        if (!O.hasStructPrinter || O.hasStructPrinter(SN, PC))
        {
          if (O.requestStructPrinter)
            O.requestStructPrinter(SN, PC);
          // The temp keeps the pointer expression to a single evaluation.
          const std::string V = "__vt_p" + UID;
          QualType CP = Ctx.getPointerType(PC.withConst());
          return "{ " + declText(CP, V, Ctx, O.isC) + " = " + P + "; " +
                 "if (" + V + ") " + SN + O.dbgPrefix + "(" + S + ", " + V +
                 "); else " + RT + "null(" + S + "); }";
        }
      }
      return call1("ptr", "(const void *)" + P);
    }

    // ----------------------------------------------------------------- arrays
    if (const auto *CAT = Ctx.getAsConstantArrayType(C))
    {
      QualType Elem = CAT->getElementType();
      QualType EC = Elem.getCanonicalType().getUnqualifiedType();
      uint64_t N = CAT->getSize().getZExtValue();

      if (const auto *BT = EC->getAs<BuiltinType>())
        if (isPlainChar(BT))
          return RT + "cstrn(" + S + ", (const char *)" + P + ", (vt_size)" +
                 std::to_string(N) + "u);";

      if (!isNameable(EC) || !O.exprIsLValue)
        return call1("ptr", "(const void *)" + P);

      const uint64_t Shown = N < O.maxArrayElems ? N : O.maxArrayElems;
      const std::string A = "__vt_a" + UID, I = "__vt_i" + UID;
      QualType EP = Ctx.getPointerType(Elem);

      std::string Body = emitRepr(A + "[" + I + "]", Elem, Ctx, O, Depth + 1);

      std::string Out;
      Out += "{ " + declText(EP, A, Ctx, O.isC) + " = " + P + "; vt_size " + I +
             "; " + RT + "putc(" + S + ", '['); ";
      Out += "for (" + I + " = 0; " + I + " < (vt_size)" +
             std::to_string(Shown) + "u; ++" + I + ") { if (" + I + ") " + RT +
             "lit(" + S + ", \", \"); " + Body + " } ";
      if (Shown < N)
        Out += RT + "lit(" + S + ", \", ...+" + std::to_string(N - Shown) +
               "\"); ";
      Out += RT + "putc(" + S + ", ']'); }";
      return Out;
    }
    if (C->isArrayType()) // VLA or incomplete: size isn't known here
      return call1("ptr", "(const void *)" + P);

    // ---------------------------------------------------------------- the rest
    if (C->isFunctionType())
      return literal("<function>");
    if (C->isMemberPointerType())
      return literal("<member-ptr>");
    if (C->isVectorType() || C->isExtVectorType())
      return literal("<vector>");
    if (C->isComplexType())
    {
      QualType E = C->castAs<ComplexType>()->getElementType();
      return "{ " + RT + "putc(" + S + ", '('); " +
             emitRepr("__real__ " + P, E, Ctx, O, Depth + 1) + " " + RT +
             "lit(" + S + ", \"+\"); " +
             emitRepr("__imag__ " + P, E, Ctx, O, Depth + 1) + " " + RT +
             "lit(" + S + ", \"i)\"); }";
    }
    if (C->isBlockPointerType() || C->isObjCObjectPointerType())
      return call1("ptr", "(const void *)" + P);

    return literal("<unsupported>");
  }

} // namespace vtrace
