#include <string>

void __dbg_emit(const std::string);

#ifdef __DBG_IMPL

static std::string __dbg_gen_id(std::string file);

inline const std::string __dbg_fmt_ctx(std::string ctxId, std::string kind,
                                       int16_t startLine, int16_t startCol, int16_t endLine, int16_t endCol);

inline void __func_enter(const std::string ctx, const std::string func_name);
inline void __func_exit(const std::string ctx);
inline void __func_return(const std::string ctx, std::string returnVal);
inline void __var_decl(const std::string ctx, std::string name, std::string type, std::string val);
inline void __var_change(const std::string ctx, std::string name, std::string type, std::string val, std::string oldVal);

#endif

#ifndef __DBG_IMPL
#define __DBG_IMPL

static std::string __dbg_gen_id(std::string file)
{
    static int uid = 0;
    return file + "@" + std::to_string(uid++);
}

inline const std::string __dbg_fmt_ctx(std::string ctxId, std::string kind,
                                       int16_t startLine, int16_t startCol, int16_t endLine, int16_t endCol)
{
    return ctxId + "|" + kind + "|" +
           std::to_string(startLine) + "|" + std::to_string(startCol) + "|" + std::to_string(endLine) + "|" + std::to_string(endCol);
}

inline void __func_enter(const std::string ctx, const std::string func_name)
{
    __dbg_emit(ctx + "|" + func_name);
}

inline void __func_exit(const std::string ctx)
{
    __dbg_emit(ctx);
}
inline void __func_return(const std::string ctx, std::string returnVal)
{
    __dbg_emit(ctx + "|" + returnVal);
}
inline void __var_decl(const std::string ctx, std::string name, std::string type, std::string val)
{
    __dbg_emit(ctx + "|" + name + "|" + type + "|" + val);
}
inline void __var_change(const std::string ctx, std::string name, std::string type, std::string val, std::string oldVal)
{
    __dbg_emit(ctx + "|" + name + "|" + type + "|" + val + "|" + oldVal);
}

#endif // __DBG_IMPL
