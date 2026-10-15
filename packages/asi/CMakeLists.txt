# The in-game toolbox, a plain DLL renamed to ".asi" and loaded by Ultimate ASI Loader inside "bge.exe"

# SafetyHook (inline/mid-function hooks), fetched from source so it compiles with the project's own compiler
# (avoiding the MSVC/clang ABI mismatches of vcpkg-prebuilt binaries), it pulls its own pinned Zydis
# (instruction decoder used to relocate hooked instructions)
set(SAFETYHOOK_FETCH_ZYDIS ON CACHE BOOL "" FORCE)
FetchContent_Declare(
    safetyhook
    GIT_REPOSITORY https://github.com/cursey/safetyhook.git
    GIT_TAG        v0.7.0
    GIT_SHALLOW    TRUE
    SYSTEM
)
FetchContent_MakeAvailable(safetyhook)

# Core library (all sources except dllmain.cpp, shared by the ASI and its tests)
# Note: Uses "CONFIGURE_DEPENDS" to automatically re-run CMake when new files are added
file(GLOB_RECURSE ASI_LIB_SOURCES CONFIGURE_DEPENDS src/*.cpp)
list(FILTER ASI_LIB_SOURCES EXCLUDE REGEX ".*/dllmain\\.cpp$")

add_library(MDiskModLoaderLib STATIC ${ASI_LIB_SOURCES})
apply_compiler_flags(MDiskModLoaderLib)
enable_release_ipo(MDiskModLoaderLib)

target_include_directories(MDiskModLoaderLib PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

# Trimmed Windows headers, without the "min"/"max" macros that break "std::min"/"std::max",
# and the project version for "MODLOADER_VERSION"
target_compile_definitions(MDiskModLoaderLib PUBLIC
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    MDISK_VERSION_STRING="${PROJECT_VERSION}"
)

target_link_libraries(MDiskModLoaderLib PUBLIC safetyhook::safetyhook)

# The ASI itself
add_library(MDiskModLoader SHARED src/dllmain.cpp)
apply_compiler_flags(MDiskModLoader)
enable_release_ipo(MDiskModLoader)
target_link_libraries(MDiskModLoader PRIVATE MDiskModLoaderLib)
set_target_properties(MDiskModLoader PROPERTIES PREFIX "" SUFFIX ".asi")

# Ship the default configuration next to the built ASI, copied at configure time (CMake re-runs
# automatically when the file changes) rather than through a post-build command, post-build commands
# go through "cmd.exe /C" with nested quotes, which breaks on paths containing "&"
configure_file(MDiskModLoader.ini ${CMAKE_BINARY_DIR}/MDiskModLoader.ini COPYONLY)

# Install the ASI and its configuration, ready to be copied into the game folder
install(TARGETS MDiskModLoader RUNTIME DESTINATION .)
install(FILES MDiskModLoader.ini DESTINATION .)

# Tests
if(MDISK_BUILD_TESTS)
    file(GLOB_RECURSE ASI_TEST_SOURCES CONFIGURE_DEPENDS tests/*.cpp)

    add_executable(MDiskModLoaderTests ${ASI_TEST_SOURCES})
    apply_compiler_flags(MDiskModLoaderTests)
    target_link_libraries(MDiskModLoaderTests PRIVATE MDiskModLoaderLib Catch2::Catch2WithMain)

    # Must happen before "catch_discover_tests" so DLLs are present when the exe is run at build time
    copy_runtime_dlls(MDiskModLoaderTests)

    # Discover tests when "ctest" runs instead of right after linking, avoiding one more post-build command,
    # prefixed with the package name since every package registers its tests in the same "ctest" run
    catch_discover_tests(MDiskModLoaderTests DISCOVERY_MODE PRE_TEST TEST_PREFIX "asi: ")
endif()
