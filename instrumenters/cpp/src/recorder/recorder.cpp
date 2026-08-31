
#ifndef __DBG_COMMON
#define __DBG_COMMON

struct __dbg_Fn_arg
{
    std::string name;
    std::string type;
    std::string value;
};
#endif

#ifdef __DBG_IMPL

static std::string __dbg_gen_id(std::string file);

inline const std::string __dbg_fmt_ctx(std::string ctxId, std::string event,
                                       int16_t startLine, int16_t startCol, int16_t endLine, int16_t endCol);

inline void __func_enter(const std::string ctx, const std::string func_name, const struct __dbg_Fn_arg args[], int args_count);
inline void __func_exit(const std::string ctx);
inline void __func_return(const std::string ctx, std::string type, std::string returnVal);
inline void __var_decl(const std::string ctx, std::string name, std::string type, std::string val);
inline void __var_change(const std::string ctx, std::string name, std::string type, std::string val, std::string oldVal);
inline void __expr(const std::string ctx, std::string type, std::string val);

#endif

#ifndef __DBG_IMPL
#define __DBG_IMPL
#include <sys/time.h>
#include <string>

void __dbg_emit(const std::string);

#define __DBG_JFS(n, v) '"' + n + "\":\"" + v + '"'         // Json_Field_Str
#define __DBG_JFN(n, v) '"' + n + "\":" + std::to_string(v) // Json_Field_Num
#define __DBG_JF(n, v) '"' + n + "\":" + v                  // Json_Field
#define __DBG(v) static_cast<std::string>(debug().noloc(), v)

static std::string __dbg_gen_id(std::string file)
{
    static int uid = 0;
    return file + "@" + std::to_string(uid++);
}

inline const std::string __dbg_fmt_ctx(std::string ctxId, std::string event,
                                       int16_t startLine, int16_t startCol, int16_t endLine, int16_t endCol)
{
    struct timeval now;
    gettimeofday(&now, NULL);

    return std::string() +
           __DBG_JFS("ctx_id", ctxId) + ',' +
           __DBG_JFN("time", now.tv_usec) + ',' +
           __DBG_JFS("event", event) + ',' +
           __DBG_JF("loc", '{' +
                               __DBG_JF("start", '{' + __DBG_JFN("line", startLine) + ',' + __DBG_JFN("col", startCol) + "},") +
                               __DBG_JF("end", '{' + __DBG_JFN("line", endLine) + ',' + __DBG_JFN("col", endCol) + "}}"));
}

inline const std::string __dbg_fmt_val(const std::string name, const std::string type, const std::string value)
{
    return std::string("") + __DBG_JFS("name", name) + ',' + __DBG_JFS("type", type) + ',' + __DBG_JFS("val", value);
}

inline void __func_enter(const std::string ctx, const std::string func_name, const struct __dbg_Fn_arg args[], int args_count)
{
    std::string args_str;
    for (size_t i = 0; i < args_count; i++)
    {
        if (i == 0)
        {
            args_str = '[';
        }

        args_str += '{' + __dbg_fmt_val(args[i].name, args[i].type, args[i].value) + "},";

        if (i == args_count - 1)
        {
            args_str[args_str.size() - 1] = ']';
        }
    }
    if (args_count == 0)
        args_str = "[]";

    __dbg_emit('{' + ctx + ',' + __DBG_JFS("fn_name", func_name) + ',' + __DBG_JF("args", args_str) + '}');
}

inline void __func_exit(const std::string ctx)
{
    __dbg_emit('{' + ctx + ',' + __DBG_JF("return_val", "null") + '}');
}
inline void __func_return(const std::string ctx, std::string type, std::string returnVal)
{
    __dbg_emit('{' + ctx + ',' + __DBG_JFS("type", type) + ',' + __DBG_JFS("return_val", returnVal) + '}');
}
inline void __var_decl(const std::string ctx, std::string name, std::string type, std::string val)
{
    __dbg_emit('{' + ctx + ',' + __DBG_JF("var", "{" + __dbg_fmt_val(name, type, val) + "}") + '}');
}
inline void __var_change(const std::string ctx, std::string name, std::string type, std::string val, std::string oldVal)
{
    __dbg_emit('{' + ctx + ',' + __DBG_JF("var", "{" + __dbg_fmt_val(name, type, val) + "}") + __DBG_JFS("old_val", oldVal) + '}');
}
inline void __expr(const std::string ctx, std::string type, std::string val)
{
    __dbg_emit('{' + ctx + ',' + __DBG_JFS("type", type) + __DBG_JFS("val", val) + '}');
}

#endif // __DBG_IMPL
