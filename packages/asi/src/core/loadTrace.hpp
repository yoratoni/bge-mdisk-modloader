#pragma once

#include <cstdint>
#include <filesystem>
#include <optional>

/**
 * @brief Opens (and truncates) the load trace file and writes its header, every later `loadTraceRecord` call
 * appends to it.
 *
 * The trace is a tab-separated file with one row per distinct (key, callback, parent) seen: the key of the file,
 * the RVA of the loader callback the game called it with (which identifies its type), its reference flags and
 * the key of the file that referenced it.
 * @param traceFilePath The path of the trace file.
 */
void loadTraceInit(const std::filesystem::path& traceFilePath);

/**
 * @brief A thread-safe writer that records a resolved file reference, only once per distinct
 * (key, callback, parent), and flushes immediately so the trace stays complete even if the game crashes.
 * @param key The key of the file.
 * @param callbackRva The RVA of the loader callback.
 * @param flags The reference flags.
 * @param parentKey The key of the file that queued the reference, `std::nullopt` if unknown.
 */
void loadTraceRecord(uint32_t key, uint32_t callbackRva, uint8_t flags, std::optional<uint32_t> parentKey);
