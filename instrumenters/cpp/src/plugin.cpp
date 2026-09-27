#include "instrumenter.hpp"

// Required by the GCC/Clang plugin loader — declares GPL compatibility.
// Without this symbol the host compiler refuses to dlopen the plugin.
extern "C" int plugin_is_GPL_compatible;

class InstrumenterAction : public PluginASTAction
{

private:
  std::filesystem::path outputDir;
  std::filesystem::path srcRoot;

public:
  std::unique_ptr<ASTConsumer>
  CreateASTConsumer(CompilerInstance &CI, llvm::StringRef)
  {
    auto IC = std::make_unique<InstrumenterConsumer>(CI);
    IC->outputDir = outputDir;
    IC->srcRoot = srcRoot;
    return IC;
  };

  bool ParseArgs(const CompilerInstance &,
                 const std::vector<std::string> &args)
  {
    if (args.size() != 1)
    {
      std::cerr << "The instrumentation plugin requires a single argument - path to debug destination" << std::endl;
      exit(1);
    }

    outputDir = args[0];
    if (!std::filesystem::exists(outputDir))
    {
      std::cerr << "Directory " << outputDir << " doesn't exist" << std::endl;
      exit(1);
    }
    outputDir = std::filesystem::canonical(outputDir);
    if (outputDir.empty())
    {
      std::cerr << "Output directory cannot be empty" << std::endl;
      exit(1);
    }
    if (!outputDir.has_parent_path())
    {
      std::cerr << "Output directory must have a parent" << std::endl;
      exit(1);
    }

    srcRoot = outputDir.parent_path();
    return true;
  }

  // Run after the main action (parsing) so we get the full AST.
  ActionType getActionType() { return AddAfterMainAction; }
};

static FrontendPluginRegistry::Add<InstrumenterAction> X("instrumenter", "Insert debug recorder calls into C/C++ source");