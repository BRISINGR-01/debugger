#pragma once

#include "recorder.hpp"
#include <string>

inline const char *event_kind_name(EventKind k)
{
    switch (k)
    {
    case EventKind::FuncEnter:
        return "func_enter";
    case EventKind::FuncReturn:
        return "func_return";
    case EventKind::FuncExit:
        return "func_exit";
    case EventKind::VarDecl:
        return "var_decl";
    case EventKind::VarChange:
        return "var_change";
    case EventKind::TryEnter:
        return "try_enter";
    case EventKind::CatchEnter:
        return "catch_enter";
    case EventKind::CatchExit:
        return "catch_exit";
    case EventKind::ThrowSite:
        return "throw_site";
    case EventKind::BranchTaken:
        return "branch_taken";
    case EventKind::LoopIter:
        return "loop_iter";
    case EventKind::Custom:
        return "custom";
    }
    return "unknown";
}
