#include "core/config.hpp"
#include "core/constants.hpp"
#include "core/log.hpp"
#include "core/memory.hpp"
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <format>
#include <string>
#include <windows.h>

/**
 * @brief Returns the full path of a loaded module.
 * @param module The module, `nullptr` for the executable of the current process.
 * @return The full path of the module file.
 */
static std::filesystem::path getModulePath(HMODULE module) {
    std::wstring buffer(MAX_PATH, L'\0');
    DWORD length = GetModuleFileNameW(module, buffer.data(), static_cast<DWORD>(buffer.size()));

    // A length equal to the buffer size means the path was truncated
    while (length == buffer.size()) {
        buffer.resize(buffer.size() * 2);
        length = GetModuleFileNameW(module, buffer.data(), static_cast<DWORD>(buffer.size()));
    }

    buffer.resize(length);
    return buffer;
}

/**
 * @brief Sets up the log, checks the host process and loads the configuration.
 *
 * Runs synchronously from `DllMain`, Ultimate ASI Loader loads the plugins from the entry point of the game,
 * so anything installed here is in place before the game initializes.
 * @param asiModule The module of this ASI.
 */
static void initialize(HMODULE asiModule) {
    const std::filesystem::path asiDirectory = getModulePath(asiModule).parent_path();

    logInit(asiDirectory / LOG_FILE_NAME);
    logWrite(std::format("{} v{}", MODLOADER_DISPLAY_NAME, MODLOADER_VERSION));

    if (lstrcmpiW(getModulePath(nullptr).filename().c_str(), GAME_EXECUTABLE_NAME.data()) != 0) {
        logWrite("Not running inside the game executable, staying inactive");
        return;
    }

    // Identifies the game build, signatures are only guaranteed to match the build they were made for
    const uint32_t gameTimestamp = memoryGetTimestamp(GetModuleHandleW(nullptr));
    const std::chrono::sys_seconds gameBuildTime { std::chrono::seconds { gameTimestamp } };

    logWrite(std::format("Game build: {:%Y-%m-%d %H:%M:%S} UTC (PE timestamp {})", gameBuildTime, gameTimestamp));

    const LoaderConfig config = configLoad(asiDirectory / CONFIG_FILE_NAME);

    logWrite(std::format("Config: enabled={}", config.isEnabled));

    if (!config.isEnabled) {
        logWrite("Disabled in the configuration, staying inactive");
        return;
    }

    logWrite("Ready");
}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    // Note: No "DisableThreadLibraryCalls" here, the static CRT this DLL links against
    // relies on the thread attach/detach notifications to manage its per-thread data
    if (reason == DLL_PROCESS_ATTACH) {
        initialize(module);
    }

    return TRUE;
}
