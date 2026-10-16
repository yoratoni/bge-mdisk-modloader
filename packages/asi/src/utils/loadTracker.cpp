#include "utils/loadTracker.hpp"
#include "core/constants.hpp"
#include <cstdint>
#include <optional>

void LoadTracker::observeQueue(uint32_t nextFreeSlot) {
    if (nextFreeSlot >= LOA_QUEUE_SIZE) {
        return;
    }

    if (!observedNextFreeSlot) {
        observedNextFreeSlot = nextFreeSlot;
        return;
    }

    const std::optional<uint32_t> parentKey
        = loadingKeys.empty() ? std::nullopt : std::optional<uint32_t> { loadingKeys.back() };

    // The queue is a ring, the slots between the last look and now were appended in order
    for (uint32_t slot = *observedNextFreeSlot; slot != nextFreeSlot; slot = (slot + 1) % LOA_QUEUE_SIZE) {
        slotParents[slot] = parentKey;
    }

    observedNextFreeSlot = nextFreeSlot;
}

std::optional<uint32_t> LoadTracker::resolve(uint32_t slot, uint32_t key, bool isLoading) {
    if (slot >= LOA_QUEUE_SIZE) {
        return std::nullopt;
    }

    // The slot is free again once resolved, a later reference queued in it must not inherit this parent
    const std::optional<uint32_t> parentKey = slotParents[slot];
    slotParents[slot].reset();

    if (isLoading) {
        // A callback that never returns (an error escaping it) would leave its key on the stack forever,
        // a depth no real nesting reaches means the stack is stale
        if (loadingKeys.size() >= LOAD_TRACKER_MAX_DEPTH) {
            loadingKeys.clear();
        }

        loadingKeys.push_back(key);
    }

    return parentKey;
}

void LoadTracker::finishLoading(uint32_t nextFreeSlot) {
    observeQueue(nextFreeSlot);

    if (!loadingKeys.empty()) {
        loadingKeys.pop_back();
    }
}
