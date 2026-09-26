#include <string>

inline const std::string __ctos(const char v);
inline const std::string __stos(const short v);
inline const std::string __itos(const int v);
inline const std::string __ltos(const long v);
inline const std::string __lltos(const long long v);
inline const std::string __ftos(const float v);
inline const std::string __dtos(const double v);
inline const std::string __ldtos(const long double v);

inline const std::string __dbg_gen_id(std::string file, int line);

inline const std::string __dbg_fmt_ctx(std::string ctxId, std::string event,
                                       int16_t startLine, int16_t startCol, int16_t endLine, int16_t endCol);

inline void __func_enter(const std::string ctx, const std::string func_name, const struct __dbg_Fn_arg args[], int args_count);
inline void __func_exit(const std::string ctx);
inline void __func_return(const std::string ctx, std::string type, std::string returnVal);
inline void __var_decl(const std::string ctx, std::string name, std::string type, std::string val);
inline void __var_change(const std::string ctx, std::string name, std::string type, std::string val, std::string oldVal);
inline void __expr(const std::string ctx, std::string type, std::string val);
