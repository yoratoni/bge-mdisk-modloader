#include "core/loadTrace.hpp"
#include <cstdint>
#include <filesystem>
#include <format>
#include <fstream>
#include <mutex>
#include <optional>
#include <set>
#include <tuple>

/**
 * @brief A distinct row of the trace, the parent is stored as `UINT64_MAX` when unknown.
 */
using LoadTraceRow = std::tuple<uint32_t, uint32_t, uint64_t>;

static std::ofstream traceFile;
static std::mutex traceMutex;
static std::set<LoadTraceRow> recordedRows;

void loadTraceInit(const std::filesystem::path& traceFilePath) {
    std::lock_guard<std::mutex> lock(traceMutex);

    traceFile.open(traceFilePath, std::ios::out | std::ios::trunc);
    traceFile << "key\tcallback\tflags\tparent\n";
    traceFile.flush();
}

void loadTraceRecord(uint32_t key, uint32_t callbackRva, uint8_t flags, std::optional<uint32_t> parentKey) {
    std::lock_guard<std::mutex> lock(traceMutex);

    if (!traceFile.is_open()) {
        return;
    }

    const LoadTraceRow row { key, callbackRva, parentKey ? *parentKey : UINT64_MAX };

    if (!recordedRows.insert(row).second) {
        return;
    }

    const std::string parentColumn = parentKey ? std::format("{:08x}", *parentKey) : "";
    traceFile << std::format("{:08x}\t{:x}\t{:02x}\t{}\n", key, callbackRva, flags, parentColumn);
    traceFile.flush();
}
