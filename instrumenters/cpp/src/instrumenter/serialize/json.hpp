#pragma once
#include "string"
#include <sstream>

class jsonStr
{
  inline const std::string quote(const std::string &name);
  std::stringstream data;

public:
  jsonStr();

  void addKeyVal(const std::string &key, const std::string &val);
  void addKeyStr(const std::string &key, const std::string &val);
  const std::string str();
};
