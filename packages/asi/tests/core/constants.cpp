#include "core/constants.hpp"
#include "utils/pattern.hpp"
#include <catch2/catch_test_macros.hpp>
#include <optional>

// Every signature was checked to match exactly once in bge.exe (Aug 2 2024 build),
// these tests only guard against typos when editing them
TEST_CASE("Signatures parse and hook a concrete byte inside the pattern", "[core][constants]") {
    const Signature signatures[] = {
        LOA_RESOLVE_SIGNATURE,
        LOA_QUEUE_END_SIGNATURE,
    };

    for (const Signature& signature : signatures) {
        INFO(signature.name);

        const std::optional<BytePattern> pattern = parseBytePattern(signature.pattern);
        REQUIRE(pattern.has_value());

        // Hooks and reads must land on known code, never on a wildcard (RIP-relative displacement)
        REQUIRE(signature.hookOffset < pattern->size());
        CHECK((*pattern)[signature.hookOffset].has_value());
    }
}

TEST_CASE("Hooked sites point at the expected instructions", "[core][constants]") {
    SECTION("the callback return hook lands inside the reference resolve pattern, after the callback call") {
        const std::optional<BytePattern> pattern = parseBytePattern(LOA_RESOLVE_SIGNATURE.pattern);
        REQUIRE(pattern.has_value());

        const size_t callOffset = LOA_RESOLVE_SIGNATURE.hookOffset + LOA_RESOLVE_CALLBACK_RETURN_OFFSET - 3;
        REQUIRE(callOffset + 3 < pattern->size());

        // FF 53 10 = call qword ptr [rbx + 0x10], the loader callback
        CHECK((*pattern)[callOffset] == 0xFF);
        CHECK((*pattern)[callOffset + 1] == 0x53);
        CHECK((*pattern)[callOffset + 2] == static_cast<uint8_t>(LOA_REF_CALLBACK_OFFSET));
    }

    SECTION("the queue end site is a cmp ecx against a RIP-relative global") {
        const std::optional<BytePattern> pattern = parseBytePattern(LOA_QUEUE_END_SIGNATURE.pattern);
        REQUIRE(pattern.has_value());

        // 3B 0D = cmp ecx, dword ptr [rip + disp32]
        CHECK((*pattern)[LOA_QUEUE_END_SIGNATURE.hookOffset] == 0x3B);
        CHECK((*pattern)[LOA_QUEUE_END_SIGNATURE.hookOffset + 1] == 0x0D);
        CHECK(!(*pattern)[LOA_QUEUE_END_SIGNATURE.hookOffset + CMP_RIP_DISPLACEMENT_OFFSET].has_value());
    }
}
