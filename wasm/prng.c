/**
 * prng.c — Bit-deterministic seeded pseudo-random source for replay parity.
 *
 * Implements PCG XSL-RR 64/32 (Melissa O'Neill, public domain) so the same
 * (seed, stream) reproduces the same uint32 / [0,1) double stream byte-for-byte
 * across Chromium, Gecko, WebKit, Wasmtime, and a host-clang reference build.
 *
 * Construction uses pure integer arithmetic plus an integer-to-double mapping
 * that lands every output exactly on a multiple of 2^-53, so IEEE-754 double
 * rounding cannot diverge between engines.
 *
 * State is owned by the caller (TS bridge): allocate sizeof(prng_t) bytes via
 * _malloc, call prng_seed, then drive prng_next_u32 / prng_next_f64 against
 * the pointer until disposed.
 *
 * Public ABI keeps stream/seed as uint32_t to dodge ccall's i64-as-BigInt
 * marshalling. The internal pcg32 step uses uint64_t state — that is what
 * makes the period 2^64 instead of mulberry32's 2^32.
 */

#include <stdint.h>

#include "prng.h"

/* PCG32 single step. State must be non-zero after seeding for the rotate-XOR
 * mixing to break the linear-congruential structure of the multiplier.
 * Keeping the function `static` lets the compiler inline it into both
 * prng_next_u32 and prng_next_f64; -O2 already does so. */
static uint32_t pcg32_step(prng_t *r) {
    uint64_t old = r->state;
    r->state = old * 6364136223846793005ULL + (r->inc | 1u);
    uint32_t xorshifted = (uint32_t)(((old >> 18u) ^ old) >> 27u);
    uint32_t rot = (uint32_t)(old >> 59u);
    return (xorshifted >> rot) | (xorshifted << ((-rot) & 31u));
}

/**
 * Seed a PRNG state. `stream` selects an independent output sequence by
 * choosing the odd increment `inc = (stream << 1) | 1`. The cast to uint64_t
 * happens before the shift, so all 32 bits of `stream` are preserved and the
 * stream → inc mapping is injective over the full uint32_t domain. Conventional
 * usage is stream=0 for level_rng and stream=1 for gameplay_rng, which map to
 * inc=1 and inc=3 respectively — two distinct odd increments yielding fully
 * independent sequences.
 *
 * The two-step warmup (advance then add seed then advance) follows O'Neill's
 * reference and ensures the first emitted draw already depends on every bit
 * of the seed.
 */
void prng_seed(prng_t *r, uint32_t seed, uint32_t stream) {
    r->state = 0u;
    r->inc = ((uint64_t)stream << 1u) | 1u;
    pcg32_step(r);
    r->state += (uint64_t)seed;
    pcg32_step(r);
}

uint32_t prng_next_u32(prng_t *r) {
    return pcg32_step(r);
}

/**
 * Draw a [0, 1) double. Produces 53 random mantissa bits — 26 from one u32
 * draw (top), 27 from a second (bottom) — and maps them to a multiple of
 * 2^-53. Every output is exactly representable, so rounding cannot diverge.
 */
double prng_next_f64(prng_t *r) {
    uint32_t a = pcg32_step(r) >> 6;   /* 26 high bits */
    uint32_t b = pcg32_step(r) >> 5;   /* 27 low bits */
    return ((double)a * 134217728.0 + (double)b) * (1.0 / 9007199254740992.0);
}
