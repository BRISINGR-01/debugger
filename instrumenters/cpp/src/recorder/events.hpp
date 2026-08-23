#pragma once

#include <string>
#include <optional>
#include <vector>
#include <cstdint>

enum class EventKind : uint8_t
{
    FuncEnter,
    FuncReturn,
    FuncExit,
    VarDecl,
    VarChange,
    TryEnter,
    CatchEnter,
    CatchExit,
    ThrowSite,
    BranchTaken,
    LoopIter,
    Custom,
};

typedef struct Loc
{
    const struct
    {
        const u_int line;
        const u_int col;
    } start;
    const struct
    {
        const u_int line;
        const u_int col;
    } end;
} Loc;

// Execution context: every run of every fn has a unique one

typedef struct Var
{
    const std::string &name;
    const std::string &type;
    const std::string &val;
} Var;

typedef struct Arg : Var
{
    const Loc loc;
} Arg;

typedef struct Event
{
    const int ctxId;
    const Loc loc;
    const EventKind kind;
} Event;

typedef struct Call : Event
{
    const std::string &value;
} Call;

typedef struct FnEnter : Event
{
    const std::string &file;
    const std::string &name;
} FnEnter;

typedef struct FnExit : Event
{
    const std::optional<std::string> returnVal;
} FnExit;

typedef struct VarDeclare : Event
{
    const Var var;
} VarDeclare;

typedef struct VarChange : Event
{
    const Var var;
    const std::string &oldValue;
} VarChange;

typedef struct Error : Event
{
    const std::string &mesage;
} Error;
