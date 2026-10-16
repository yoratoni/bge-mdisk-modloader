#include "core/hooks.hpp"
#include "core/constants.hpp"
#include "core/loadTrace.hpp"
#include "core/log.hpp"
#include "core/memory.hpp"
#include "utils/loadTracker.hpp"
#include <cstdint>
#include <format>
#include <mutex>
#include <optional>
#include <safetyhook.hpp>
#include <string_view>
#include <windows.h>

static uintptr_t gameModuleBase = 0;

/**
 * @brief The game's next free slot of the file reference queue (Jade's `LOA_gi_LastRef`).
 */
static const int32_t* nextFreeQueueSlot = nullptr;

static LoadTracker loadTracker;
static std::mutex loadTrackerMutex;

static safetyhook::MidHook referenceResolveHook;
static safetyhook::MidHook callbackReturnHook;

/**
 * @brief Reference resolve hook: records the reference about to be loaded (or already loaded) and its parent.
 * @param context The registers at the hook site (`rbx` = file reference, `rsi` = its slot, `rax` = the loaded data
 * or `LOA_ADDRESS_NOT_LOADED`).
 */
static void onReferenceResolve(safetyhook::Context& context) {
    const uintptr_t reference = context.rbx;

    const uint32_t key = *reinterpret_cast<const uint32_t*>(reference + LOA_REF_KEY_OFFSET);
    const uintptr_t callback = *reinterpret_cast<const uintptr_t*>(reference + LOA_REF_CALLBACK_OFFSET);
    const uint8_t flags = *reinterpret_cast<const uint8_t*>(reference + LOA_REF_FLAGS_OFFSET);
    const bool isLoading = context.rax == LOA_ADDRESS_NOT_LOADED;

    std::optional<uint32_t> parentKey;

    {
        std::lock_guard<std::mutex> lock(loadTrackerMutex);
        loadTracker.observeQueue(static_cast<uint32_t>(*nextFreeQueueSlot));
        parentKey = loadTracker.resolve(static_cast<uint32_t>(context.rsi), key, isLoading);
    }

    loadTraceRecord(key, static_cast<uint32_t>(callback - gameModuleBase), flags, parentKey);
}

/**
 * @brief Callback return hook: the references queued by the callback become children of its file.
 */
static void onCallbackReturn(safetyhook::Context&) {
    std::lock_guard<std::mutex> lock(loadTrackerMutex);
    loadTracker.finishLoading(static_cast<uint32_t>(*nextFreeQueueSlot));
}

/**
 * @brief Creates a mid-function hook and logs the result.
 * @param gameModule The game executable module (for the log).
 * @param hook The hook object to fill.
 * @param name The hook name (for the log).
 * @param address The hooked address.
 * @param callback The function called at the hook site.
 * @return True if the hook was created.
 */
static bool createMidHook(HMODULE gameModule,
    safetyhook::MidHook& hook,
    std::string_view name,
    uintptr_t address,
    safetyhook::MidHookFn callback) {
    hook = safetyhook::create_mid(reinterpret_cast<void*>(address), callback);

    if (!hook) {
        logWrite(std::format("[{}] Failed to hook {}", name, memoryFormatAddress(gameModule, address)));
        return false;
    }

    logWrite(std::format("[{}] Hooked", name));
    return true;
}

/**
 * @brief Installs the load trace hooks, around the loader callback call of the reference resolution.
 * @param gameModule The game executable module.
 * @return True if both hooks were installed.
 */
static bool installLoadTrace(HMODULE gameModule) {
    // Locate everything first, nothing gets hooked unless every site was found
    const std::optional<uintptr_t> referenceResolveAddress = memoryFindSignature(gameModule, LOA_RESOLVE_SIGNATURE);
    const std::optional<uintptr_t> queueEndAddress = memoryFindSignature(gameModule, LOA_QUEUE_END_SIGNATURE);

    if (!referenceResolveAddress || !queueEndAddress) {
        logWrite("At least one signature wasn't found, nothing was hooked (unsupported game version?)");
        return false;
    }

    nextFreeQueueSlot = reinterpret_cast<const int32_t*>(
        memoryResolveRelative32(*queueEndAddress, CMP_RIP_DISPLACEMENT_OFFSET, CMP_RIP_INSTRUCTION_LENGTH));

    logWrite(std::format("Next free reference slot at {}",
        memoryFormatAddress(gameModule, reinterpret_cast<uintptr_t>(nextFreeQueueSlot))));

    if (!createMidHook(gameModule,
            referenceResolveHook,
            LOA_RESOLVE_SIGNATURE.name,
            *referenceResolveAddress,
            onReferenceResolve)) {
        return false;
    }

    return createMidHook(gameModule,
        callbackReturnHook,
        "Callback return",
        *referenceResolveAddress + LOA_RESOLVE_CALLBACK_RETURN_OFFSET,
        onCallbackReturn);
}

bool hooksInstall(HMODULE gameModule, const LoaderConfig& config) {
    gameModuleBase = reinterpret_cast<uintptr_t>(gameModule);

    if (config.traceLoads && !installLoadTrace(gameModule)) {
        return false;
    }

    return true;
}
