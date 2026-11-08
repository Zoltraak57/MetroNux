cmake_minimum_required(VERSION 3.22.1)
project(metronuxnode)

add_library(metronux-node SHARED native-lib.cpp)

target_include_directories(metronux-node PRIVATE
  ${CMAKE_SOURCE_DIR}/include/node
)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES
  IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so
)

find_library(log-lib log)

target_link_libraries(metronux-node libnode ${log-lib})
