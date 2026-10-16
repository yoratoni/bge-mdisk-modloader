#pragma once

#include "types.hpp"
#include <cstddef>
#include <cstdint>
#include <string_view>

/**
 * @brief The display name of the mod loader, written at the top of the log.
 */
constexpr std::string_view MODLOADER_DISPLAY_NAME = "BG&E MDISK Mod Loader";

/**
 * @brief The version of the mod loader, written at the top of the log, defined once in `CMakeLists.txt`
 * (`project(... VERSION ...)`) and passed as the `MDISK_VERSION_STRING` compile definition.
 */
constexpr std::string_view MODLOADER_VERSION = MDISK_VERSION_STRING;

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
 * @brief The name of the load trace file (tab-separated values), located next to the ASI.
 */
constexpr std::wstring_view LOAD_TRACE_FILE_NAME = L"MDiskModLoader.loads.tsv";

/**
 * @brief The INI section holding the master switch.
 */
constexpr const wchar_t* CONFIG_SECTION_GENERAL = L"General";

/**
 * @brief The INI section holding the research and diagnostic toggles, all disabled by default.
 */
constexpr const wchar_t* CONFIG_SECTION_DEBUG = L"Debug";

/**
 * @brief The INI key of `LoaderConfig::isEnabled` (section `General`).
 */
constexpr const wchar_t* CONFIG_KEY_ENABLED = L"Enabled";

/**
 * @brief The INI key of `LoaderConfig::traceLoads` (section `Debug`).
 */
constexpr const wchar_t* CONFIG_KEY_TRACE_LOADS = L"TraceLoads";

/**
 * @brief The configuration used for every key missing from the INI file (or when there's no INI file at all).
 */
constexpr LoaderConfig DEFAULT_LOADER_CONFIG {
    .isEnabled = true,
    .traceLoads = false,
};

/**
 * @brief The number of slots of the game's file reference queue (Jade's `LOA_C_MaxStack`), its indices wrap
 * around it.
 */
constexpr uint32_t LOA_QUEUE_SIZE = 5000;

/**
 * @brief The offset of the key inside a file reference (Jade's `LOA_tdst_Ref`, a `uint32_t`).
 */
constexpr uintptr_t LOA_REF_KEY_OFFSET = 0x00;

/**
 * @brief The offset of the loader callback inside a file reference (a function pointer, the callback receives the
 * position of the file and returns the loaded data).
 */
constexpr uintptr_t LOA_REF_CALLBACK_OFFSET = 0x10;

/**
 * @brief The offset of the flags inside a file reference (a `uint8_t`, Jade's `LOA_C_MustExists`, ...).
 */
constexpr uintptr_t LOA_REF_FLAGS_OFFSET = 0x18;

/**
 * @brief The value the game's loaded file lookup (Jade's `LOA_ul_SearchAddress`) returns for a file that isn't
 * loaded yet, its callback is then called.
 */
constexpr uint64_t LOA_ADDRESS_NOT_LOADED = UINT64_MAX;

/**
 * @brief The depth of nested file loads past which the load tracker considers its stack stale and clears it.
 */
constexpr size_t LOAD_TRACKER_MAX_DEPTH = 256;

/**
 * @brief The file reference resolution (Jade's `LOA_Resolve`), hooked right after the loaded file lookup
 * (`rbx` = file reference, `esi` = its slot, `rax` = the loaded data or `LOA_ADDRESS_NOT_LOADED`).
 */
constexpr Signature LOA_RESOLVE_SIGNATURE {
    .name = "Reference resolve",
    .pattern = "8B CF 4D 03 FD 49 8B D7 E8 ?? ?? ?? ?? 48 8B E8 48 83 F8 FF 75 38 8B CF FF 53 10 F6 43 18 04",
    .hookOffset = 0x0D,
};

/**
 * @brief The offset from the `LOA_RESOLVE_SIGNATURE` hook to the instruction right after the loader callback call
 * (`call qword ptr [rbx + 0x10]`), hooked to know when the callback returned.
 */
constexpr uintptr_t LOA_RESOLVE_CALLBACK_RETURN_OFFSET = 0x0E;

/**
 * @brief The end of the file reference resolution loop, located on `cmp ecx, [rip + disp32]` against the next free
 * slot of the queue (Jade's `LOA_gi_LastRef`), only read to resolve that global.
 */
constexpr Signature LOA_QUEUE_END_SIGNATURE {
    .name = "Reference queue end",
    .pattern = "89 35 ?? ?? ?? ?? C1 FA 0B 8B C2 C1 E8 1F 03 D0 69 C2 88 13 00 00 2B C8 3B 0D ?? ?? ?? ?? 0F 85",
    .hookOffset = 0x18,
};

/**
 * @brief The offset of the 32-bit displacement inside `cmp ecx, [rip + disp32]`.
 */
constexpr size_t CMP_RIP_DISPLACEMENT_OFFSET = 2;

/**
 * @brief The length of `cmp ecx, [rip + disp32]`.
 */
constexpr size_t CMP_RIP_INSTRUCTION_LENGTH = 6;
