cmake_minimum_required(VERSION 3.16) 
project(Greeter)
include(FetchContent)
FetchContent_Declare(
  cpptrace
  GIT_REPOSITORY https://github.com/jeremy-rifkin/cpptrace.git
  GIT_TAG        v1.0.4 # <HASH or TAG>
)
FetchContent_MakeAvailable(cpptrace)

add_executable(app main.cpp)
target_link_libraries(app cpptrace::cpptrace)

