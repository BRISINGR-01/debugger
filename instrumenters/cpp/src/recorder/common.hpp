#include <string>

#ifndef __DBG_COMMON
#define __DBG_COMMON

#define __DBG_JFS(n, v) '"' + n + "\":\"" + __dbg_escape(v) + '"' // Json_Field_Str
#define __DBG_JFN(n, v) '"' + n + "\":" + std::to_string(v)       // Json_Field_Num
#define __DBG_JF(n, v) '"' + n + "\":" + v                        // Json_Field
#define __DBG(v) "#"

struct __dbg_Fn_arg
{
  std::string name;
  std::string type;
  std::string value;
  int startLine;
  int startCol;
  int endLine;
  int endCol;
};
#endif