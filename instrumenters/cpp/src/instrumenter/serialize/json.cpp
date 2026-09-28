#include "json.hpp"
#include "utils.hpp"

jsonStr::jsonStr() : data() {}

const std::string jsonStr::quote(const std::string &name)
{
  return '"' + name + "\"";
}
void jsonStr::addKeyVal(const std::string &key, const std::string &val)
{
  data << '"' << escape(quote(key)) << ":\"+" << val + "+\",\"+";
}
void jsonStr::addKeyStr(const std::string &key, const std::string &val)
{
  addKeyVal(key, quote(val));
}

const std::string jsonStr::str()
{
  std::string str = data.str();
  if (str.size() == 0)
    return "null";

  str = str.substr(0, str.size() - 4); // remove "\",\"+"

  return "std::string(\"{\")+" + str + "\"}\"";
}