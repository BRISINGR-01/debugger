cmake_minimum_required(VERSION 3.16) 
project(test)

# add_executable(print printVals.cpp)
add_executable(app structures.cpp dbg-emit.cpp)

find_package(nlohmann_json 3.12.0 REQUIRED)
target_link_libraries(app PRIVATE nlohmann_json::nlohmann_json)
