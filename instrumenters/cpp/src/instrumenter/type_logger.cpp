#include "./include/instrumenter.hpp"
using namespace clang;

// Returns the dump *expression* to use for a given variable of type T at a
// call site: either "v.__dbg_dump()" (C++ method) or "Widget_dbg_dump(&v)" (C free fn).
std::string dump_call_expr_for(const std::string &varExpr, QualType T, ASTContext &Ctx)
{
    if (const auto *RT = T.getNonReferenceType()->getAs<RecordType>())
    {
        const RecordDecl *RD = RT->getDecl();
        if (isa<CXXRecordDecl>(RD))
            return varExpr + ".__dbg_dump()";
        else
            return RD->getNameAsString() + "_dbg_dump(&(" + varExpr + "))";
    }
    // primitive/pointer/etc — defer to overloaded to_dbg_str
    return "to_dbg_str(" + varExpr + ")";
}

std::string construct_record_reflector(RecordDecl *RD, Rewriter &RW, const LangOptions &LO)
{
    if (!RD || !RD->isCompleteDefinition())
        return ""; // opaque type: no body to inject into, caller falls back to hex dump

    if (EmittedReflectors.count(RD))
        return "";
    EmittedReflectors.insert(RD);

    std::string name = RD->getNameAsString();
    bool isCpp = isa<CXXRecordDecl>(RD);

    std::ostringstream prelude; // free-function definitions, emitted outside the class

    if (isCpp)
    {
        auto *CRD = cast<CXXRecordDecl>(RD);

        // recurse into bases first so their own __dbg_dump() exists
        for (const auto &Base : CRD->bases())
            if (auto *BaseRD = Base.getType()->getAsCXXRecordDecl())
                prelude << construct_record_reflector(BaseRD, RW, LO);

        // --- build the public method body ---
        std::ostringstream method;
        method << "public:\n";
        method << "    std::string __dbg_dump() const {\n";
        method << "        std::ostringstream os; os << \"" << name << "{\";\n";
        method << "        bool first = true;\n";

        for (const auto &Base : CRD->bases())
        {
            if (auto *BaseRD = Base.getType()->getAsCXXRecordDecl())
            {
                std::string bn = BaseRD->getNameAsString();
                method << "        dbgrt::append_field(os, first, \"<" << bn
                       << ">\", " << "static_cast<const " << bn << "&>(*this).__dbg_dump());\n";
            }
        }

        for (const FieldDecl *FD : CRD->fields())
        {
            std::string fname = FD->getNameAsString();
            if (FD->isAnonymousStructOrUnion())
            {
                method << "        dbgrt::append_field(os, first, \"<anon>\", \"<unsupported>\");\n";
                continue;
            }
            std::string accessExpr = "this->" + fname;
            if (FD->isBitField())
                accessExpr = "(long long)(" + accessExpr + ")";
            // recurse: if field is itself a record type, call its __dbg_dump / free fn
            std::string valExpr = dump_call_expr_for(accessExpr, FD->getType(), RD->getASTContext());
            method << "        dbgrt::append_field(os, first, \"" << fname
                   << "\", " << valExpr << ");\n";
        }

        method << "        os << \"}\"; return os.str();\n";
        method << "    }\n";

        // insert BEFORE the closing brace of the class
        SourceLocation endLoc = RD->getBraceRange().getEnd();
        RW.InsertTextBefore(endLoc, method.str());
    }
    else
    {
        prelude << construct_c_struct_fn(RD, RW);
    }

    return prelude.str();
}
