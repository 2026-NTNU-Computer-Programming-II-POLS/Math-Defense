/**
 * level_gen.h — Wire format and public ABI for the level generator.
 *
 * Three layers exposed:
 *   - Phase 3: intersection solver + spawn calculator (find_pair_intersections,
 *     find_all_curves_common_point, count_common_intersections_in_interval,
 *     compute_spawn_points). Each takes curve_t[] + caller-allocated output
 *     buffers, returns a count, writes results in-place.
 *   - Phase 4: full generate_level — orchestrates the rejection-sampling loop
 *     and writes a single generated_level_t back to the caller.
 *
 * All struct field widths are pinned to <stdint.h> types so emcc (wasm32),
 * host clang (x86_64), and a future Wasmtime host all agree on the layout.
 *
 * Multiset wire encoding (TS-side helper produces this; C-side decodes):
 *   1, 2, 3   → polynomial degree
 *   100       → trig sin
 *   101       → trig cos
 *   200       → log
 */

#ifndef MD_LEVEL_GEN_H
#define MD_LEVEL_GEN_H

#include <stdint.h>
#include "curve.h"
#include "prng.h"

#define MAX_CURVES   8
#define MAX_SPAWNS   (MAX_CURVES * 2)

#define MULTISET_POLY_DEG_1  1
#define MULTISET_POLY_DEG_2  2
#define MULTISET_POLY_DEG_3  3
#define MULTISET_TRIG_SIN    100
#define MULTISET_TRIG_COS    101
#define MULTISET_LOG         200

/* spawn_t — 20 bytes; 4-byte aligned, no padding required. */
typedef struct {
    float    x;
    float    y;
    uint32_t edge;       /* 0=top, 1=bottom, 2=left, 3=right */
    int32_t  curve_index;
    int32_t  side;       /* +1 right of P*, -1 left of P* */
} spawn_t;

/* generated_level_t — flat record written by generate_level. Field order is
 * stable (any change here is an ABI break — bump replay_version). Sizes:
 *   success(4) + curve_count(4) + curves(8*24=192) + endpoint(8)
 *   + region(16) + interval(8) + spawn_count(4) + spawns(16*20=320)
 *   = 556 bytes
 */
typedef struct {
    int32_t  success;       /* 1 = ok, 0 = exhausted */
    int32_t  curve_count;
    curve_t  curves[MAX_CURVES];
    float    endpoint_x;
    float    endpoint_y;
    float    region_x_min;
    float    region_x_max;
    float    region_y_min;
    float    region_y_max;
    float    interval_lo;
    float    interval_hi;
    int32_t  spawn_count;
    spawn_t  spawns[MAX_SPAWNS];
} generated_level_t;

/* Phase 3 — bridge-callable primitives. Each writes at most max_out entries
 * to out_xs/out_ys/out_spawns and returns the number actually written. */
int32_t find_pair_intersections(
    const curve_t *c1,
    const curve_t *c2,
    float          x_min,
    float          x_max,
    float          step,
    float         *out_xs,
    int32_t        max_out
);

int32_t find_all_curves_common_point(
    const curve_t *curves,
    int32_t        curve_count,
    float          x_min,
    float          x_max,
    float          step,
    float         *out_xs,
    float         *out_ys,
    int32_t        max_out
);

int32_t count_common_intersections_in_interval(
    const curve_t *curves,
    int32_t        curve_count,
    float          x_min,
    float          x_max
);

int32_t compute_spawn_points(
    const curve_t *curves,
    int32_t        curve_count,
    float          endpoint_x,
    float          endpoint_y,
    spawn_t       *out_spawns,
    int32_t        max_out
);

/* Phase 4 — full level generator. Returns 1 on success (out is populated),
 * 0 on exhaustion. The caller chooses the multiset (TS-side); the C side
 * receives the entry list as int32 codes. */
int32_t generate_level(
    int32_t           star_rating,
    prng_t           *rng_state,
    const int32_t    *multiset_entries,
    int32_t           multiset_len,
    generated_level_t *out
);

#endif /* MD_LEVEL_GEN_H */
