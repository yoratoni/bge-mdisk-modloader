#pragma once

#include "types.hpp"
#include <filesystem>

/**
 * @brief Loads the mod loader configuration from an INI file, every missing key (or the whole file)
 * falls back to `DEFAULT_LOADER_CONFIG`.
 * @param configFilePath The path of the INI file.
 * @return The loaded configuration.
 */
LoaderConfig configLoad(const std::filesystem::path& configFilePath);
