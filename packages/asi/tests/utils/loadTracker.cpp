#include "core/constants.hpp"
#include "utils/loadTracker.hpp"
#include <catch2/catch_test_macros.hpp>
#include <cstdint>
#include <optional>

TEST_CASE("LoadTracker", "[utils][loadTracker]") {
    LoadTracker tracker;

    SECTION("references queued before the tracker started have no parent") {
        tracker.observeQueue(3);

        CHECK(tracker.resolve(0, 0x71003FF9, true) == std::nullopt);
        CHECK(tracker.resolve(1, 0x71003FF3, false) == std::nullopt);
    }

    SECTION("references queued during a callback are children of its file") {
        tracker.observeQueue(0);

        // Slot 0 holds the world, queued by top-level code
        tracker.observeQueue(1);
        CHECK(tracker.resolve(0, 0x5E0084DF, true) == std::nullopt);

        // The world's callback queues two objects (slots 1 and 2)
        tracker.finishLoading(3);

        CHECK(tracker.resolve(1, 0x10000001, false) == std::optional<uint32_t> { 0x5E0084DF });
        CHECK(tracker.resolve(2, 0x10000002, false) == std::optional<uint32_t> { 0x5E0084DF });
    }

    SECTION("nested resolves attribute each slot to the innermost running callback") {
        tracker.observeQueue(0);
        tracker.observeQueue(1);

        // The world loads and queues an object (slot 1), then resolves it before returning
        CHECK(tracker.resolve(0, 0x5E0084DF, true) == std::nullopt);
        tracker.observeQueue(2);
        CHECK(tracker.resolve(1, 0x10000001, true) == std::optional<uint32_t> { 0x5E0084DF });

        // The object queues its graphic object (slot 2) and returns, then the world returns
        tracker.finishLoading(3);
        tracker.finishLoading(3);

        CHECK(tracker.resolve(2, 0x9E000083, false) == std::optional<uint32_t> { 0x10000001 });
    }

    SECTION("a resolved slot doesn't keep its parent when reused") {
        tracker.observeQueue(0);
        tracker.observeQueue(1);
        tracker.resolve(0, 0x5E0084DF, true);
        tracker.finishLoading(2);

        CHECK(tracker.resolve(1, 0x10000001, false) == std::optional<uint32_t> { 0x5E0084DF });
        CHECK(tracker.resolve(1, 0x10000001, false) == std::nullopt);
    }

    SECTION("the queue wraps around") {
        tracker.observeQueue(LOA_QUEUE_SIZE - 1);
        tracker.resolve(LOA_QUEUE_SIZE - 2, 0x5E0084DF, true);
        tracker.finishLoading(1);

        CHECK(tracker.resolve(LOA_QUEUE_SIZE - 1, 0x10000001, false) == std::optional<uint32_t> { 0x5E0084DF });
        CHECK(tracker.resolve(0, 0x10000002, false) == std::optional<uint32_t> { 0x5E0084DF });
    }

    SECTION("out of range slots are ignored") {
        tracker.observeQueue(LOA_QUEUE_SIZE);

        CHECK(tracker.resolve(LOA_QUEUE_SIZE, 0x5E0084DF, true) == std::nullopt);
    }
}
