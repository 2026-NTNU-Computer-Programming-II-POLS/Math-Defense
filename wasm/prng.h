/**
 * prng.h — Public ABI for the bit-deterministic PCG32 PRNG.
 *
 * Shared between prng.c (the WASM/host implementation) and any other C
 * translation unit in this directory that needs to draw deterministic
 * randomness — notably level_gen.c (Phase 4) and parity_test.c.
 *
 * Field widths are pinned to <stdint.h> types so the struct layout is
 * identical across emcc (wasm32), host clang (x86_64), and any future
 * Wasmtime host. Do not reorder — the TS bridge does not parse the struct
 * directly today, but server-side replay validation will.
 */

#ifndef MD_PRNG_H
#define MD_PRNG_H

#include <stdint.h>

typedef struct {
    uint64_t state;  /* PCG internal state, advances on every draw */
    uint64_t inc;    /* odd stream id; set once at seed time */
} prng_t;            /* 16 bytes */

void     prng_seed     (prng_t *r, uint32_t seed, uint32_t stream);
uint32_t prng_next_u32 (prng_t *r);
double   prng_next_f64 (prng_t *r);

#endif /* MD_PRNG_H */
