cmake_minimum_required(VERSION 3.21)

# The only place the version is defined, shared by every package (passed to the code as "MDISK_VERSION_STRING")
# and checked against the tag by the release workflow
project(MDisk VERSION 0.0.1 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Emit build/compile_commands.json, which is what clangd reads to resolve includes and flags
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Static CRT everywhere (dependencies included), the ".asi" is dropped into the game folder and the packer ships
# as a single executable, neither must depend on a specific MSVC runtime being installed
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Every binary (ASI, packer, tests) lands at the root of the build directory, where the release workflow picks it up
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

# The packages to build, the ASI runs inside the game so it's only built on Windows by default
option(MDISK_BUILD_ASI "Build the in-game toolbox (MDiskModLoader.asi)" ${WIN32})
option(MDISK_BUILD_TESTS "Build the tests of every enabled package" ON)

# Check LTO/IPO support once, "enable_release_ipo" turns it on per target (not globally, so it doesn't
# propagate to dependencies)
cmake_policy(SET CMP0069 NEW)
include(CheckIPOSupported)
check_ipo_supported(RESULT MDISK_IPO_SUPPORTED OUTPUT _ipo_error LANGUAGES CXX)
if(NOT MDISK_IPO_SUPPORTED)
    message(WARNING "IPO/LTO not supported by toolchain: ${_ipo_error}")
endif()

# Compiler flags and target helpers
include(cmake/compilerFlags.cmake)
include(cmake/runtimeDlls.cmake)

# Shared dependencies, every package fetches its own dependencies on top of these
include(FetchContent)

if(MDISK_BUILD_TESTS)
    include(cmake/catch2.cmake)
    enable_testing()
endif()

# Packages, each one has its own "CMakeLists.txt", sources, dependencies and tests
if(MDISK_BUILD_ASI)
    add_subdirectory(packages/asi)
endif()
