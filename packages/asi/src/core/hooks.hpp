#pragma once

#include "types.hpp"
#include <windows.h>

/**
 * @brief Locates every hook site needed by the enabled features, then installs the hooks.
 *
 * All-or-nothing: if any signature fails to match exactly once (e.g. after a game update),
 * nothing is hooked and the game runs stock.
 * @param gameModule The game executable module.
 * @param config The mod loader configuration.
 * @return True if every enabled hook was installed (or if no feature needs one).
 */
bool hooksInstall(HMODULE gameModule, const LoaderConfig& config);
