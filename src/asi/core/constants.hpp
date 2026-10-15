#pragma once

#include "types.hpp"
#include <string_view>

/**
 * @brief The display name of the mod loader, written at the top of the log.
 */
constexpr std::string_view MODLOADER_DISPLAY_NAME = "BG&E MDISK Mod Loader";

/**
 * @brief The version of the mod loader, written at the top of the log, defined once in `CMakeLists.txt`
 * (`project(... VERSION ...)`) and passed as the `MODLOADER_VERSION_STRING` compile definition.
 */
constexpr std::string_view MODLOADER_VERSION = MODLOADER_VERSION_STRING;

/**
 * @brief The name of the game executable, the mod loader stays inactive inside any other process.
 */
constexpr std::wstring_view GAME_EXECUTABLE_NAME = L"bge.exe";

/**
 * @brief The name of the configuration file, located next to the ASI.
 */
constexpr std::wstring_view CONFIG_FILE_NAME = L"MDiskModLoader.ini";

/**
 * @brief The name of the log file, located next to the ASI.
 */
constexpr std::wstring_view LOG_FILE_NAME = L"MDiskModLoader.log";

/**
 * @brief The INI section holding the master switch.
 */
constexpr const wchar_t* CONFIG_SECTION_GENERAL = L"General";

/**
 * @brief The INI key of `LoaderConfig::isEnabled` (section `General`).
 */
constexpr const wchar_t* CONFIG_KEY_ENABLED = L"Enabled";

/**
 * @brief The configuration used for every key missing from the INI file (or when there's no INI file at all).
 */
constexpr LoaderConfig DEFAULT_LOADER_CONFIG {
    .isEnabled = true,
};
