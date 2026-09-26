#include "include/schema.hpp"

static json flattenType(const clang::ASTContext &Ctx, clang::QualType QT, uint64_t currentOffset, const std::string &currentPath)
{
    // Strip qualifiers like 'const' or 'volatile'
    QT = QT.getUnqualifiedType();

    // --- CASE A: Fixed-size Arrays (e.g., int arr[2][2]) ---
    if (const auto *AT = Ctx.getAsConstantArrayType(QT))
    {
        json array = json::array();
        uint64_t elementCount = AT->getSize().getZExtValue();
        clang::QualType elementType = AT->getElementType();
        uint64_t elementSizeBytes = Ctx.getTypeSizeInChars(elementType).getQuantity();

        for (uint64_t i = 0; i < elementCount; ++i)
        {
            std::string indexedPath = currentPath + "[" + std::to_string(i) + "]";
            uint64_t elementOffset = currentOffset + (i * elementSizeBytes);

            // Recursively process elements (handles arrays of nested structs/multi-dim arrays)
            array.push_back(flattenType(Ctx, elementType, elementOffset, indexedPath));
        }
        return array;
    }

    // --- CASE B: Nested Structs/Classes ---
    if (const auto *RT = QT->getAs<clang::RecordType>())
    {
        clang::RecordDecl *NestedRD = RT->getDecl();
        return recordSchema(Ctx, NestedRD, currentOffset, currentPath);
    }

    // --- CASE C: Leaf Primitives, Pointers, Enums, etc. ---
    return {
        {"fullPath", currentPath},
        {"typeName", QT.getAsString()},
        {"offsetBytes", currentOffset},
        {"sizeBytes", Ctx.getTypeSizeInChars(QT).getQuantity()},
        {"isBitField", false},
        {"bitWidth", 0},
    };
}

json recordSchema(const clang::ASTContext &Ctx, const clang::RecordDecl *RD)
{
    return recordSchema(Ctx, RD, 0, "");
}

json recordSchema(const clang::ASTContext &Ctx, const clang::RecordDecl *RD,
                  uint64_t baseOffsetBytes,
                  const std::string &pathPrefix)
{
    if (!RD || !RD->isCompleteDefinition())
        return {};

    json schema = {

        {"bases", json::array()},
        {"fields", json::array()},
    };

    // 1. Handle Base Classes if this is a C++ Class/Struct
    if (const auto *CXXRD = clang::dyn_cast<clang::CXXRecordDecl>(RD))
    {
        const clang::ASTRecordLayout &Layout = Ctx.getASTRecordLayout(CXXRD);
        for (const auto &Base : CXXRD->bases())
        {
            if (const auto *BaseDecl = Base.getType()->getAsCXXRecordDecl())
            {
                uint64_t baseOffset = Layout.getBaseClassOffset(BaseDecl).getQuantity();
                schema["bases"].push_back(recordSchema(Ctx, BaseDecl, baseOffsetBytes + baseOffset, pathPrefix));
            }
        }
    }

    // 2. Iterate through fields
    const clang::ASTRecordLayout &Layout = Ctx.getASTRecordLayout(RD);

    schema["name"] = RD->getQualifiedNameAsString();
    schema["size"] = Layout.getSize().getQuantity();

    for (const auto *field : RD->fields())
    {
        uint64_t fieldOffsetBits = Layout.getFieldOffset(field->getFieldIndex());
        uint64_t fieldAbsoluteOffset = baseOffsetBytes + (fieldOffsetBits / 8);

        std::string fieldName = field->getNameAsString();
        std::string currentPath = pathPrefix.empty() ? fieldName : pathPrefix + "." + fieldName;

        clang::QualType fieldType = field->getType();

        // Handle Bit-fields directly
        if (field->isBitField())
        {
            schema["fields"].push_back({
                {"fullPath", currentPath},
                {"typeName", fieldType.getAsString()},
                {"offsetBytes", fieldAbsoluteOffset},
                {"isBitField", true},
                {"bitWidth", field->getBitWidthValue()},
                {"sizeBytes", 0},
            });
            continue;
        }

        // Unroll fields recursively
        schema["fields"].push_back(flattenType(Ctx, fieldType, fieldAbsoluteOffset, currentPath));
    }

    return schema;
}
