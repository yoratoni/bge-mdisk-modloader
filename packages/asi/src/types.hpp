#pragma once

#include <cstddef>
#include <string_view>

/**
 * @brief A code signature used to locate a hook site inside the game executable.
 */
struct Signature {
    /**
     * @brief A short human-readable name, used in the log.
     */
    std::string_view name;

    /**
     * @brief The byte pattern to scan for, written as hex bytes separated by spaces,
     * with `??` as a wildcard (used for every RIP-relative displacement and call target).
     */
    std::string_view pattern;

    /**
     * @brief The offset from the start of the match to the hooked/patched address.
     */
    size_t hookOffset;
};

/**
 * @brief The mod loader configuration, read from the INI file next to the ASI.
 */
struct LoaderConfig {
    bool isEnabled; // Master switch, the ASI loads but does nothing when false
    bool traceLoads; // Research: writes every file reference the game resolves (key, loader, parent) to a TSV file
};
