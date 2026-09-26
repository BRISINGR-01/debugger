#include "json.hpp"

jsonStr::jsonStr() : data("\"{") {}

const std::string jsonStr::quote(const std::string &name)
{
  return '"' + name + "\"";
}
void jsonStr::addKeyVal(const std::string &key, const std::string &val)
{
  data << quote(key) << ":" << val + ",";
}
void jsonStr::addKeyStr(const std::string &key, const std::string &val)
{
  data << quote(key) << ":" << quote(val) + ",";
}

const std::string jsonStr::str()
{
  std::string str = data.str();

  if (str.ends_with(','))
  {
    str.pop_back();
  }

  return str + "}\"";
}