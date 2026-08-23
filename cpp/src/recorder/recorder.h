#ifndef __DBG_RECORDER
#define __DBG_RECORDER

#include "events.hpp"
#include <memory>
#include <string>
#include <vector>

void __dbg_emit(const Event &);

int __func_enter(const std::string &file,
                 u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
                 const std::string &func, std::vector<Arg> args = {});
void __func_exit(int ctxId,
                 u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol);
void __func_return(int ctxId,
                   u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
                   std::string returnVal);
void __var_decl(int ctxId,
                u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
                std::string name, std::string type, std::string val);
void __var_change(int ctxId,
                  u_int16_t startLine, u_int16_t startCol, u_int16_t endLine, u_int16_t endCol,
                  std::string name, std::string type, std::string val, std::string oldVal);

#endif // __DBG_RECORDER
