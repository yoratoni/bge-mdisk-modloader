#pragma once

#include "core/constants.hpp"
#include <array>
#include <cstdint>
#include <optional>
#include <vector>

/**
 * @brief Rebuilds the tree of the file references the game resolves: a reference queued while the loader callback of
 * another file runs is a child of that file.
 *
 * The game queues its references in a ring of `LOA_QUEUE_SIZE` slots, and the queueing code is inlined everywhere,
 * so the tracker watches the queue grow instead: every slot appended since its last look belongs to the file whose
 * callback is running, or to no file when none is. Callbacks can resolve references themselves (nested resolves),
 * the running files are kept as a stack.
 */
class LoadTracker {
public:
    /**
     * @brief Attributes the slots queued since the last call to the file whose callback is running.
     *
     * The first call only records the position, the slots queued before the tracker started have no known parent.
     * @param nextFreeSlot The index of the next free slot of the queue (Jade's `LOA_gi_LastRef`).
     */
    void observeQueue(uint32_t nextFreeSlot);

    /**
     * @brief Records the resolution of a reference, called before its callback runs (when it runs).
     * @param slot The slot of the reference.
     * @param key The key of the reference.
     * @param isLoading True if the file isn't loaded yet, its callback is about to run.
     * @return The key of the file that queued the reference, `std::nullopt` if it wasn't queued by a callback.
     */
    std::optional<uint32_t> resolve(uint32_t slot, uint32_t key, bool isLoading);

    /**
     * @brief Records the end of the callback of the file being loaded, the slots it queued become its children.
     * @param nextFreeSlot The index of the next free slot of the queue (Jade's `LOA_gi_LastRef`).
     */
    void finishLoading(uint32_t nextFreeSlot);

private:
    /**
     * @brief The parent of every queued slot, `std::nullopt` for slots without a known parent.
     */
    std::array<std::optional<uint32_t>, LOA_QUEUE_SIZE> slotParents {};

    /**
     * @brief The keys of the files whose callbacks are running, the innermost last.
     */
    std::vector<uint32_t> loadingKeys;

    /**
     * @brief The next free slot seen by the last `observeQueue` call.
     */
    std::optional<uint32_t> observedNextFreeSlot;
};
