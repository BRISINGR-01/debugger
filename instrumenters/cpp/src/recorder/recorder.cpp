#include "recorder.h"

void __dbg_emit(const Event &ev)
{
    printf("{ id: %d, kind: %d", ev.ctxId, ev.kind);
}

int __func_enter(const std::string &file, u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol, const char *func)
{
    static int id = 0;

    __dbg_emit(FnEnter{
        {
            .kind = EventKind::FuncEnter,
            .ctxId = id,
            .loc = {
                .start = {.line = startLine, .col = startCol},
                .end = {.line = endLine, .col = endCol},
            },
        },
        .name = func,
    });

    return id++;
}

void __func_exit(int ctxId, u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol, std::optional<std::string> returnVal)
{
    __dbg_emit(FnExit{
        {
            .kind = EventKind::FuncExit,
            .ctxId = ctxId,
            .loc = {
                .start = {.line = startLine, .col = startCol},
                .end = {.line = endLine, .col = endCol},
            },
        },
        .returnVal = returnVal,
    });
}

void __var_decl(int ctxId, u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol, std::string name, std::string type, std::string val)
{
    __dbg_emit(VarDeclare{
        {
            .kind = EventKind::VarDecl,
            .ctxId = ctxId,
            .loc = {
                .start = {.line = startLine, .col = startCol},
                .end = {.line = endLine, .col = endCol},
            },
        },
        .var = {
            .name = name,
            .type = type,
            .val = val,
        },
    });
}

void __var_change(int ctxId, u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol, std::string name, std::string type, std::string val, std::string oldVal)
{
    __dbg_emit(VarChange{
        {
            .kind = EventKind::VarChange,
            .ctxId = ctxId,
            .loc = {
                .start = {.line = startLine, .col = startCol},
                .end = {.line = endLine, .col = endCol},
            },
        },
        .var = {
            .name = name,
            .type = type,
            .val = val,
        },
        .oldValue = oldVal,
    });
}