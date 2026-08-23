#include "./include/type_logger.hpp"

#include "clang/AST/Decl.h"
#include "clang/AST/RecordLayout.h"

#include <cctype>

using namespace clang;

//===----------------------------------------------------------------------===//
// Public entry point
//===----------------------------------------------------------------------===//

std::string TypeLogger::buildLogStmt(QualType QT, const std::string &expr,
                                     const std::string &displayName)
{
    std::string body = dispatch(QT, expr, displayName, /*depth=*/0);
    // Wrapping in its own block means the snippet can be inserted as a
    // single statement anywhere a statement is legal, without colliding
    // with any local variables it introduces (loop indices, etc).
    return "{\n" + body + "}\n";
}

//===----------------------------------------------------------------------===//
// Dispatch
//===----------------------------------------------------------------------===//

std::string TypeLogger::dispatch(QualType QT, const std::string &expr,
                                 const std::string &name, int depth)
{
    if (depth > kMaxRecursionDepth)
    {
        return handleFallbackRaw(QT.getCanonicalType(), expr, name);
    }

    QualType Canon = QT.getCanonicalType();

    // C++ references are transparent in source: the expression already
    // denotes the referenced object, so just recurse on the referenced type.
    if (Canon->isReferenceType())
    {
        return dispatch(Canon->getPointeeType(), expr, name, depth);
    }

    QualType Unqual = Canon.getUnqualifiedType();

    if (Unqual->isBooleanType())
    {
        return "__log_bool(\"" + name + "\", (int)(" + expr + "));\n";
    }
    if (const BuiltinType *BT = Unqual->getAs<BuiltinType>())
    {
        return handleBuiltin(BT, expr, name);
    }
    if (Unqual->isEnumeralType())
    {
        return handleEnum(Unqual, expr, name);
    }
    if (Unqual->isPointerType())
    {
        return handlePointer(Unqual, expr, name);
    }
    if (Ctx.getAsConstantArrayType(Unqual))
    {
        return handleConstantArray(Unqual, expr, name, depth);
    }
    if (Unqual->isArrayType())
    {
        // Incomplete-size ("int a[]") or variable-length array: sizeof/element
        // count aren't known statically here, so fall back to logging the
        // decayed pointer to the first element rather than guessing a size.
        std::string decayed = "(&(" + expr + ")[0])";
        return "__log_ptr(\"" + name + "\", (const void*)(" + decayed + "));\n";
    }
    if (Unqual->isRecordType())
    {
        return handleRecord(Unqual, expr, name, depth);
    }
    if (Unqual->isFunctionType())
    {
        // A bare function-typed expression (e.g. logging `foo` where foo is a
        // function, not a function pointer) decays to its address.
        return "__log_func_ptr(\"" + name + "\", (const void*)(&(" + expr + ")));\n";
    }

    // Atomics, vector types, complex types, block pointers, member-pointers,
    // or anything else not explicitly modeled above: raw byte dump.
    return handleFallbackRaw(Unqual, expr, name);
}

//===----------------------------------------------------------------------===//
// Builtin scalar types
//===----------------------------------------------------------------------===//

std::string TypeLogger::handleBuiltin(const BuiltinType *BT,
                                      const std::string &expr,
                                      const std::string &name)
{
    switch (BT->getKind())
    {
    case BuiltinType::Bool:
        return "__log_bool(\"" + name + "\", (int)(" + expr + "));\n";
    case BuiltinType::Char_S:
    case BuiltinType::Char_U:
        return "__log_char(\"" + name + "\", (char)(" + expr + "));\n";
    case BuiltinType::SChar:
        return "__log_schar(\"" + name + "\", (signed char)(" + expr + "));\n";
    case BuiltinType::UChar:
        return "__log_uchar(\"" + name + "\", (unsigned char)(" + expr + "));\n";
    case BuiltinType::Short:
        return "__log_short(\"" + name + "\", (short)(" + expr + "));\n";
    case BuiltinType::UShort:
        return "__log_ushort(\"" + name + "\", (unsigned short)(" + expr + "));\n";
    case BuiltinType::Int:
        return "__log_int(\"" + name + "\", (int)(" + expr + "));\n";
    case BuiltinType::UInt:
        return "__log_uint(\"" + name + "\", (unsigned int)(" + expr + "));\n";
    case BuiltinType::Long:
        return "__log_long(\"" + name + "\", (long)(" + expr + "));\n";
    case BuiltinType::ULong:
        return "__log_ulong(\"" + name + "\", (unsigned long)(" + expr + "));\n";
    case BuiltinType::LongLong:
        return "__log_longlong(\"" + name + "\", (long long)(" + expr + "));\n";
    case BuiltinType::ULongLong:
        return "__log_ulonglong(\"" + name + "\", (unsigned long long)(" + expr + "));\n";
    case BuiltinType::Float:
        return "__log_float(\"" + name + "\", (float)(" + expr + "));\n";
    case BuiltinType::Double:
        return "__log_double(\"" + name + "\", (double)(" + expr + "));\n";
    case BuiltinType::LongDouble:
        return "__log_longdouble(\"" + name + "\", (long double)(" + expr + "));\n";
    case BuiltinType::WChar_S:
    case BuiltinType::WChar_U:
        return "__log_long(\"" + name + "\", (long)(" + expr + ")); /* wchar_t */\n";
    case BuiltinType::Void:
        return "/* \"" + name + "\" has type void -- nothing to log */\n";
    default:
        // Int128/UInt128, Float16/Float128, fixed-point _Accum/_Fract types,
        // etc: not worth hand-rolling a printf format for every one of these
        // -- dump the bytes instead.
        return handleFallbackRaw(QualType(BT, 0), expr, name);
    }
}

//===----------------------------------------------------------------------===//
// Pointers
//===----------------------------------------------------------------------===//

std::string TypeLogger::handlePointer(QualType QT, const std::string &expr,
                                      const std::string &name)
{
    QualType Pointee = QT->getPointeeType().getCanonicalType().getUnqualifiedType();

    if (Pointee->isCharType())
    {
        // char* / const char* / unsigned char* -- treat as a C string. If it's
        // not actually NUL-terminated at runtime this will over-read, same as
        // printf("%s", ...) would; that's an inherent risk of guessing "this
        // pointer is probably a string" from the type alone.
        return "__log_cstr(\"" + name + "\", (const char*)(" + expr + "));\n";
    }
    if (Pointee->isFunctionType())
    {
        return "__log_func_ptr(\"" + name + "\", (const void*)(" + expr + "));\n";
    }

    // Generic pointer: log the address only. Deliberately NOT dereferenced --
    // arbitrary pointers may be null, dangling, or part of a cyclic
    // structure; dereferencing here would make the instrumentation itself a
    // new source of crashes in the target program. If you want one level of
    // dereference for specific, known-safe pointer fields, do that as a
    // second, more targeted pass in your instrumenter rather than here.
    return "__log_ptr(\"" + name + "\", (const void*)(" + expr + "));\n";
}

//===----------------------------------------------------------------------===//
// Enums
//===----------------------------------------------------------------------===//

std::string TypeLogger::handleEnum(QualType QT, const std::string &expr,
                                   const std::string &name)
{
    std::string typeName = QT.getAsString(Ctx.getPrintingPolicy());
    return "__log_enum(\"" + name + "\", (long long)(" + expr + "), \"" +
           typeName + "\");\n";
}

//===----------------------------------------------------------------------===//
// Fixed-size arrays
//===----------------------------------------------------------------------===//

std::string TypeLogger::handleConstantArray(QualType QT, const std::string &expr,
                                            const std::string &name, int depth)
{
    const ConstantArrayType *CAT = Ctx.getAsConstantArrayType(QT);
    uint64_t N = CAT->getSize().getZExtValue();
    QualType ElemQT = CAT->getElementType();
    std::string elemTypeName = ElemQT.getAsString(Ctx.getPrintingPolicy());
    std::string idxVar = "__idx" + uniqueSuffix();

    // Element display name: the runtime index framing (__log_index_begin)
    // already prints "[i]:" for each entry, so the element itself just needs
    // a generic label rather than a compile-time-unknown "name[<runtime i>]".
    std::string elemExpr = "(" + expr + ")[" + idxVar + "]";
    std::string elemStmt = dispatch(ElemQT, elemExpr, "value", depth + 1);

    std::ostringstream oss;
    oss << "{\n";
    oss << "  __log_array_begin(\"" << name << "\", (size_t)(" << N
        << "), \"" << elemTypeName << "\");\n";
    oss << "  for (size_t " << idxVar << " = 0; " << idxVar << " < (size_t)("
        << N << "); ++" << idxVar << ") {\n";
    oss << "    __log_index_begin((size_t)" << idxVar << ");\n";
    oss << "    " << elemStmt;
    oss << "    __log_index_end();\n";
    oss << "  }\n";
    oss << "  __log_array_end();\n";
    oss << "}\n";
    return oss.str();
}

//===----------------------------------------------------------------------===//
// Structs / classes / unions
//===----------------------------------------------------------------------===//

std::string TypeLogger::handleRecord(QualType QT, const std::string &expr,
                                     const std::string &name, int depth)
{
    const RecordDecl *RD = QT->getAsRecordDecl();

    // Unions: the active member isn't statically knowable from the type
    // alone, so don't guess which field is "live" -- raw dump instead.
    // Incomplete/opaque records (forward-declared only): can't enumerate
    // fields either.
    if (!RD || RD->isUnion() || !RD->getDefinition() ||
        !RD->getDefinition()->isCompleteDefinition())
    {
        return handleFallbackRaw(QT, expr, name);
    }

    std::string dumperName = ensureRecordDumper(QT, depth);
    return dumperName + "(\"" + name + "\", &(" + expr + "));\n";
}

std::string TypeLogger::ensureRecordDumper(QualType QT, int depth)
{
    QualType Canon = QT.getCanonicalType();
    std::string qualifiedName = Canon.getAsString(Ctx.getPrintingPolicy());
    std::string fnName = "__dump_struct_" + sanitizeIdentifier(qualifiedName) +
                         uniqueSuffix();
    std::string cacheKey = qualifiedName;

    // Cache by the type's spelled-out canonical name so each distinct
    // record type gets exactly one dumper function, generated once, no
    // matter how many times it's encountered (directly or nested).
    static thread_local std::string dummy; // (kept for symmetry/documentation)
    for (auto &Emitted : EmittedRecordDumpers)
    {
        if (Emitted == cacheKey)
        {
            // Already generated -- recover the previously assigned function name
            // by regenerating it deterministically instead of storing a map;
            // simpler: we store name->key pairs below instead. See note.
            break;
        }
    }

    // (Re-implemented with an explicit map for clarity and correctness --
    // see header: EmittedRecordDumpers holds keys we've already generated,
    // and we derive the function name deterministically from the type name
    // alone, WITHOUT the uniqueSuffix(), so repeated lookups agree.)
    fnName = "__dump_struct_" + sanitizeIdentifier(qualifiedName);
    if (EmittedRecordDumpers.count(cacheKey))
    {
        return fnName;
    }
    // Reserve the name before recursing into fields, in case a field's type
    // (reachable only through a pointer, so never actually recursed into by
    // handlePointer) still ends up asking about this same record type.
    EmittedRecordDumpers.insert(cacheKey);

    const RecordDecl *RD = Canon->getAsRecordDecl()->getDefinition();

    std::ostringstream fn;
    fn << "static void " << fnName << "(const char *name, const "
       << qualifiedName << " *v) {\n";
    fn << "  __log_struct_begin(name, \"" << qualifiedName << "\");\n";
    emitRecordFieldsInto(RD, "v", depth + 1, fn);
    fn << "  __log_struct_end();\n";
    fn << "}\n\n";

    GeneratedDecls += fn.str();
    return fnName;
}

void TypeLogger::emitRecordFieldsInto(const RecordDecl *RD,
                                      const std::string &basePtrExpr,
                                      int depth, std::ostringstream &out)
{
    for (const FieldDecl *FD : RD->fields())
    {
        QualType FT = FD->getType();

        if (FD->isAnonymousStructOrUnion())
        {
            // Anonymous struct/union members are transparent: their sub-fields
            // are accessed directly through basePtrExpr in C11/C++, with no
            // name of their own to insert into the access expression.
            if (const RecordDecl *InnerRD = FT->getAsRecordDecl())
            {
                emitRecordFieldsInto(InnerRD, basePtrExpr, depth, out);
            }
            continue;
        }

        std::string fieldName = FD->getNameAsString();
        if (fieldName.empty())
        {
            continue; // unnamed bit-field used purely for padding/alignment
        }

        // Note: FD->isBitField() fields always have integral type, so they are
        // always handled by handleBuiltin/handleEnum (value-based, never
        // address-of) -- they never reach handleFallbackRaw, which is good
        // because &(bitfield) is not a legal C/C++ expression.
        std::string fieldExpr = basePtrExpr + "->" + fieldName;
        out << "  " << dispatch(FT, fieldExpr, fieldName, depth);
    }
}

//===----------------------------------------------------------------------===//
// Fallback: raw byte dump for anything not specifically modeled above
//===----------------------------------------------------------------------===//

std::string TypeLogger::handleFallbackRaw(QualType QT, const std::string &expr,
                                          const std::string &name)
{
    std::string typeName = QT.getAsString(Ctx.getPrintingPolicy());
    return "__log_raw(\"" + name + "\", (const void*)&(" + expr +
           "), sizeof(" + expr + "), \"" + typeName + "\");\n";
}

//===----------------------------------------------------------------------===//
// Small helpers
//===----------------------------------------------------------------------===//

std::string TypeLogger::uniqueSuffix()
{
    return "_" + std::to_string(UniqueCounter++);
}

std::string TypeLogger::sanitizeIdentifier(const std::string &s)
{
    std::string out;
    out.reserve(s.size());
    for (char c : s)
    {
        out += (std::isalnum((unsigned char)c) || c == '_') ? c : '_';
    }
    if (!out.empty() && std::isdigit((unsigned char)out[0]))
    {
        out = "_" + out;
    }
    return out;
}