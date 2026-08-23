#pragma once
// ============================================================================
//  recorder_runtime.h  —  header-only debug recorder runtime
//  Include this before any instrumented translation unit.
// ============================================================================
#include <cstdint>
#include <cstring>
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <string>
#include <variant>
#include <vector>

struct Var
{
  std::string name;
  std::string type;
  std::string val;
};

// ── Value snapshot ────────────────────────────────────────────────────────────
// We copy up to 16 bytes of a variable's raw memory at the moment of the event.
// For pointer types we store the pointer value itself (not what it points to).
struct ValueSnapshot
{
  std::string type_name; // e.g. "int", "float", "MyStruct*"
  uint8_t raw[16]{};     // raw bytes of the value (or address for ptrs)
  size_t size{};         // how many bytes are valid

  // Helper: build from an lvalue reference
  template <typename T>
  static ValueSnapshot from(const T &val, const char *tname)
  {
    std::cout << "-" << typeid(val).name() << std::endl;
    ValueSnapshot s;
    s.type_name = tname;
    s.size = sizeof(T) <= 16 ? sizeof(T) : 16;
    std::memcpy(s.raw, &val, s.size);
    return s;
  }

  // Pretty-print known scalar types; fall back to hex dump.
  [[nodiscard]] std::string str() const
  {
    if (type_name == "int" || type_name == "signed int")
    {
      int v{};
      std::memcpy(&v, raw, sizeof v);
      return std::to_string(v);
    }
    if (type_name == "unsigned int")
    {
      unsigned v{};
      std::memcpy(&v, raw, sizeof v);
      return std::to_string(v);
    }
    if (type_name == "long" || type_name == "long int")
    {
      long v{};
      std::memcpy(&v, raw, sizeof v);
      return std::to_string(v);
    }
    if (type_name == "unsigned long" || type_name == "unsigned long int")
    {
      unsigned long v{};
      std::memcpy(&v, raw, sizeof v);
      return std::to_string(v);
    }
    if (type_name == "long long" || type_name == "long long int")
    {
      long long v{};
      std::memcpy(&v, raw, sizeof v);
      return std::to_string(v);
    }
    if (type_name == "float")
    {
      float v{};
      std::memcpy(&v, raw, sizeof v);
      std::ostringstream o;
      o << v;
      return o.str();
    }
    if (type_name == "double")
    {
      double v{};
      std::memcpy(&v, raw, sizeof v);
      std::ostringstream o;
      o << v;
      return o.str();
    }
    if (type_name == "bool")
    {
      bool v{};
      std::memcpy(&v, raw, sizeof v);
      return v ? "true" : "false";
    }
    if (type_name == "char")
    {
      char v{};
      std::memcpy(&v, raw, sizeof v);
      if (v >= 32 && v < 127)
        return std::string("'") + v + "'";
      return "\\x" + std::to_string((unsigned char)v);
    }
    // Hex dump
    std::ostringstream o;
    o << "0x";
    for (size_t i = 0; i < size; ++i)
    {
      o << std::hex << (int)raw[i];
    }
    return o.str();
  }
};

// ── Argument descriptor ───────────────────────────────────────────────────────
struct ArgInfo
{
  std::string name;
  ValueSnapshot value;
};
// ── Argument descriptor ───────────────────────────────────────────────────────

struct Loc
{
  std::string file;
  struct start
  {
    int line;
    int col;
  };
  struct end
  {
    int line;
    int col;
  };
};

// ── Event kinds ───────────────────────────────────────────────────────────────
enum class EventKind : uint8_t
{
  FuncEnter,   // entering a function
  FuncReturn,  // about to return (value captured)
  FuncExit,    // leaving via a fall-through / end of void function
  VarDecl,     // local variable declared (and optionally initialized)
  VarChange,   // variable assignment detected
  TryEnter,    // entering a try block
  CatchEnter,  // entering a catch clause (exception captured as string)
  CatchExit,   // leaving a catch clause
  ThrowSite,   // throw expression reached
  BranchTaken, // if/else/switch branch selected
  LoopIter,    // loop iteration tick
  Custom,      // anything else the plugin wants to log
};

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

// ── A single recorded event ───────────────────────────────────────────────────
struct RecorderEvent
{
  EventKind kind{EventKind::Custom};
  std::string func_name; // enclosing function
  std::string name;      // variable / branch label / etc.
  Loc loc;
  std::vector<ArgInfo> args;            // for FuncEnter: all params; for others: up to 1
  std::optional<ValueSnapshot> ret_val; // for FuncReturn

  [[nodiscard]] std::string str() const
  {
    std::ostringstream o;
    o << "[" << event_kind_name(kind) << "] "
      << func_name;
    if (!name.empty() && name != func_name)
      o << "::" << name;
    if (!file.empty())
      o << "  (" << file << ":" << line << ")";
    if (!args.empty())
    {
      o << "  args={";
      for (size_t i = 0; i < args.size(); ++i)
      {
        if (i)
          o << ", ";
        o << args[i].name << "=" << args[i].value.str()
          << " [" << args[i].value.type_name << "]";
      }
      o << "}";
    }
    if (ret_val)
    {
      o << "  ret=" << ret_val->str()
        << " [" << ret_val->type_name << "]";
    }
    return o.str();
  }
};

// ── Sink interface ────────────────────────────────────────────────────────────
struct IRecorderSink
{
  virtual ~IRecorderSink() = default;
  virtual void on_event(const RecorderEvent &) = 0;
};

// ── Default sink: print to stderr ─────────────────────────────────────────────
struct StderrSink : IRecorderSink
{
  void on_event(const RecorderEvent &e) override
  {
    std::cerr << e.str() << '\n';
  }
};

// ── History sink: keep everything in memory ───────────────────────────────────
struct HistorySink : IRecorderSink
{
  std::vector<RecorderEvent> history;
  std::mutex mtx;

  void on_event(const RecorderEvent &e) override
  {
    std::lock_guard<std::mutex> g(mtx);
    history.push_back(e);
  }

  void dump(std::ostream &os = std::cerr) const
  {
    for (size_t i = 0; i < history.size(); ++i)
    {
      os << "#" << i << "  " << history[i].str() << '\n';
    }
  }

  void clear()
  {
    std::lock_guard<std::mutex> g(mtx);
    history.clear();
  }
};

// ── The Recorder ──────────────────────────────────────────────────────────────
class DebuggerRecorder
{
public:
  static DebuggerRecorder &instance()
  {
    static DebuggerRecorder instance;
    return instance;
  }

  DebuggerRecorder()
  {
    // Default: print to stderr AND keep history
    _stderr_sink = std::make_shared<StderrSink>();
    _history_sink = std::make_shared<HistorySink>();
    add_sink(_stderr_sink);
    add_sink(_history_sink);
    set_stderr_enabled(false);
  }

  void add_sink(std::shared_ptr<IRecorderSink> s)
  {
    std::lock_guard<std::mutex> g(id_mtx);
    _sinks.push_back(std::move(s));
  }

  void set_stderr_enabled(bool on)
  {
    std::lock_guard<std::mutex> g(id_mtx);
    if (on && !_stderr_sink)
    {
      _stderr_sink = std::make_shared<StderrSink>();
      _sinks.push_back(_stderr_sink);
    }
    else if (!on && _stderr_sink)
    {
      // _sinks.erase(std::remove(_sinks.begin(), _sinks.end(), _stderr_sink),
      //              _sinks.end());
      _stderr_sink.reset();
    }
  }

  void emit(RecorderEvent ev)
  {
    std::lock_guard<std::mutex> g(id_mtx);
    for (auto &s : _sinks)
      s->on_event(ev);
  }

  // ── Convenience helpers called by generated code ──────────────────────────
  void func_enter(const char *func, const char *file, int line,
                  std::vector<ArgInfo> args = {})
  {
    RecorderEvent e;
    e.kind = EventKind::FuncEnter;
    e.func_name = func;
    e.file = file;
    e.line = line;
    e.args = std::move(args);
    emit(std::move(e));
  }

  void func_exit(const char *func, const char *file, int line)
  {
    RecorderEvent e;
    e.kind = EventKind::FuncExit;
    e.func_name = func;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  template <typename T>
  void func_return(const char *func, const char *file, int line,
                   const T &val, const char *tname)
  {
    RecorderEvent e;
    e.kind = EventKind::FuncReturn;
    e.func_name = func;
    e.file = file;
    e.line = line;
    e.ret_val = ValueSnapshot::from(val, tname);
    emit(std::move(e));
  }

  void func_return_void(const char *func, const char *file, int line)
  {
    RecorderEvent e;
    e.kind = EventKind::FuncReturn;
    e.func_name = func;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  template <typename T>
  void var_decl(const char *func, const char *file, int line,
                const char *var_name, const T &val, const char *tname)
  {
    RecorderEvent e;
    e.kind = EventKind::VarDecl;
    e.func_name = func;
    e.name = var_name;
    e.file = file;
    e.line = line;
    e.args.push_back({var_name, ValueSnapshot::from(val, tname)});
    emit(std::move(e));
  }

  template <typename T>
  void var_change(const char *func, const char *file, int line,
                  const char *var_name, const T &val, const char *tname)
  {
    RecorderEvent e;
    e.kind = EventKind::VarChange;
    e.func_name = func;
    e.name = var_name;
    e.file = file;
    e.line = line;
    e.args.push_back({var_name, ValueSnapshot::from(val, tname)});
    emit(std::move(e));
  }

  void try_enter(const char *func, const char *file, int line)
  {
    RecorderEvent e;
    e.kind = EventKind::TryEnter;
    e.func_name = func;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  void catch_enter(const char *func, const char *file, int line,
                   const char *ex_type, const char *ex_what = nullptr)
  {
    RecorderEvent e;
    e.kind = EventKind::CatchEnter;
    e.func_name = func;
    e.name = ex_type;
    e.file = file;
    e.line = line;
    if (ex_what)
    {
      ValueSnapshot s;
      s.type_name = ex_type;
      std::string w = ex_what;
      size_t n = w.size() < 16 ? w.size() : 16;
      std::memcpy(s.raw, w.data(), n);
      s.size = n;
      e.args.push_back({ex_type, s});
    }
    emit(std::move(e));
  }

  void catch_exit(const char *func, const char *file, int line)
  {
    RecorderEvent e;
    e.kind = EventKind::CatchExit;
    e.func_name = func;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  void throw_site(const char *func, const char *file, int line,
                  const char *ex_type)
  {
    RecorderEvent e;
    e.kind = EventKind::ThrowSite;
    e.func_name = func;
    e.name = ex_type;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  void branch_taken(const char *func, const char *file, int line,
                    const char *label)
  {
    RecorderEvent e;
    e.kind = EventKind::BranchTaken;
    e.func_name = func;
    e.name = label;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  void loop_iter(const char *func, const char *file, int line,
                 const char *label)
  {
    RecorderEvent e;
    e.kind = EventKind::LoopIter;
    e.func_name = func;
    e.name = label;
    e.file = file;
    e.line = line;
    emit(std::move(e));
  }

  // Access the in-memory history (thread-safe copy)
  std::vector<RecorderEvent> snapshot() const
  {
    if (!_history_sink)
      return {};
    std::lock_guard<std::mutex> g(_history_sink->mtx);
    return _history_sink->history;
  }

  void dump_history(std::ostream &os = std::cout) const
  {
    if (_history_sink)
      _history_sink->dump(os);
  }

private:
  std::mutex id_mtx;
  std::vector<std::shared_ptr<IRecorderSink>> _sinks;
  std::shared_ptr<StderrSink> _stderr_sink;
  std::shared_ptr<HistorySink> _history_sink;
};

// ── Global accessor used by generated code ────────────────────────────────────
inline DebuggerRecorder &__recorder__ = DebuggerRecorder::instance();

// ── RAII scope guard for functions (handles exits via exceptions) ──────────────
struct FuncScopeGuard
{
  const char *fname;
  const char *file;
  int line;
  bool returned{false}; // set to true when an explicit return fires

  FuncScopeGuard(const char *fn, const char *fi, int l)
      : fname(fn), file(fi), line(l)
  {
  }

  ~FuncScopeGuard()
  {
    if (!returned)
      __recorder__.func_exit(fname, file, line);
  }
};