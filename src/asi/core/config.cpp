#include "core/config.hpp"
#include "core/constants.hpp"
#include <filesystem>
#include <windows.h>

/**
 * @brief Reads a boolean key (any non-zero integer is true).
 * @param configFilePath The path of the INI file.
 * @param section The INI section.
 * @param key The INI key.
 * @param defaultValue The value returned when the key is missing.
 * @return The value of the key.
 */
static bool readBool(const std::filesystem::path& configFilePath, const wchar_t* section, const wchar_t* key, bool defaultValue) {
    return GetPrivateProfileIntW(section, key, defaultValue ? 1 : 0, configFilePath.c_str()) != 0;
}

LoaderConfig configLoad(const std::filesystem::path& configFilePath) {
    LoaderConfig config = DEFAULT_LOADER_CONFIG;

    config.isEnabled = readBool(configFilePath, CONFIG_SECTION_GENERAL, CONFIG_KEY_ENABLED, config.isEnabled);

    return config;
}
