/**
 * level_gen.c — Bit-deterministic level generator + intersection / spawn helpers.
 *
 * Mirrors three TS files:
 *   - frontend/src/math/intersection-solver.ts          (Phase 3)
 *   - frontend/src/domain/path/spawn-calculator.ts      (Phase 3)
 *   - frontend/src/domain/level/level-generator.ts      (Phase 4)
 *
 * The level generator is polynomial-only, so it draws no transcendentals
 * itself; the libc transcendentals still reachable from this file (logf/ceilf
 * in the intersection bisector, and the curve evaluator's sinf/cosf/logf for
 * Magic-tower curves) compile through musl libc into the WASM bytecode, so
 * cross-engine ULP drift cannot enter the result. With -fno-fast-math /
 * -ffp-contract=off (set in wasm/Makefile) the compiler also cannot fuse FMAs
 * or rewrite the expression tree, giving us byte-exact outputs for the same
 * inputs across every host that runs the .wasm.
 *
 * Floating-point precision: every coefficient lives in `float` (32-bit IEEE)
 * end-to-end. The JS path uses doubles, so the WASM side will produce its
 * *own* deterministic bit stream that differs from the JS path by ≤ a few
 * ULPs per evaluation — replay_version=2 sessions live entirely on the WASM
 * stream; the JS fallback is only reachable when WASM failed to load and is
 * tagged as v1 (ε = 0.0005 budget, see construction plan §3.7).
 */

#include <math.h>
#include <stdint.h>

#include "curve.h"
#include "prng.h"
#include "level_gen.h"

/* ─── Shared constants — kept in sync with the TS originals. */

/* Same numerical values as frontend/src/math/intersection-solver.ts. */
#define EPS         (1.0e-6f)
#define SCAN_STEP   (0.05f)
/* Common-point tolerance widened from EPS to 100·EPS in the TS source; mirror
 * the widened threshold so an x-coordinate that survives findPairIntersections
 * is allowed to differ in y by up to 1e-4 across curves. */
#define COMMON_PT_TOL (1.0e-4f)

/* Spawn calculator. */
#define BISECT_ITERATIONS  30

/* Level generator (matches frontend/src/domain/level/level-generator.ts). */
#define ENDPOINT_MARGIN              3.0f
#define SLOPE_SEPARATION_THRESHOLD   0.3f
#define ATTEMPTS_PER_BATCH           50
#define MAX_BATCHES                  8
/* P* and every free coefficient are integer multiples of this dyadic quantum
 * (mirrors RATIONAL_QUANTUM in frontend/src/math/rational.ts). */
#define RATIONAL_QUANTUM             0.25f
/* When a multiset has a degree-3 entry, P* is drawn from [-4, 4] so a*x0^3
 * stays on-grid (mirrors DEGREE3_ENDPOINT_BOUND in level-generator.ts). */
#define DEGREE3_ENDPOINT_BOUND       4.0f

/* Grid bounds (must match shared/game-constants.json). The C side hardcodes
 * them rather than receiving them as args because they are part of the
 * deterministic level-generation contract — changing them is a replay v3. */
#define GRID_MIN_X (-14.0f)
#define GRID_MAX_X ( 14.0f)
#define GRID_MIN_Y (-14.0f)
#define GRID_MAX_Y ( 14.0f)

#define PLAYABLE_X_MIN (GRID_MIN_X + ENDPOINT_MARGIN)
#define PLAYABLE_X_MAX (GRID_MAX_X - ENDPOINT_MARGIN)
#define PLAYABLE_Y_MIN (GRID_MIN_Y + ENDPOINT_MARGIN)
#define PLAYABLE_Y_MAX (GRID_MAX_Y - ENDPOINT_MARGIN)

/* Disclosure ladder — largest first (matches DISCLOSURE_HALF_EXTENTS in TS). */
#define DISCLOSURE_LADDER_LEN 6
static const float DISCLOSURE_HALF_EXTENTS[DISCLOSURE_LADDER_LEN] = {
    3.0f, 2.5f, 2.0f, 1.5f, 1.0f, 0.5f
};

/* Dyadic coefficient candidate lists — mirrors COEFFICIENT_BOUNDS in
 * frontend/src/math/curve-types.ts. Every free coefficient the generator
 * picks is an index into one of these lists, so all generated polynomials
 * have exact dyadic coefficients. The solved term of each polynomial
 * (degree-1 intercept, degree-2 c, degree-3 d) is derived from the
 * through-point equation, not sampled, so it is not listed here. */
static const float POLY1_SLOPE[] = {
    -3.0f, -2.5f, -2.0f, -1.5f, -1.0f, -0.5f, 0.5f, 1.0f, 1.5f, 2.0f, 2.5f, 3.0f
};
static const float POLY2_A[] = { -0.5f, -0.25f, 0.25f, 0.5f };
static const float POLY2_B[] = {
    -3.0f, -2.5f, -2.0f, -1.5f, -1.0f, -0.5f, 0.5f, 1.0f, 1.5f, 2.0f, 2.5f, 3.0f
};
static const float POLY3_A[] = { -0.5f, -0.25f, 0.25f, 0.5f };
static const float POLY3_B[] = { -1.0f, -0.75f, -0.5f, -0.25f, 0.25f, 0.5f, 0.75f, 1.0f };
static const float POLY3_C[] = { -2.0f, -1.5f, -1.0f, -0.5f, 0.5f, 1.0f, 1.5f, 2.0f };

#define POLY1_SLOPE_LEN ((int32_t)(sizeof(POLY1_SLOPE) / sizeof(POLY1_SLOPE[0])))
#define POLY2_A_LEN     ((int32_t)(sizeof(POLY2_A)     / sizeof(POLY2_A[0])))
#define POLY2_B_LEN     ((int32_t)(sizeof(POLY2_B)     / sizeof(POLY2_B[0])))
#define POLY3_A_LEN     ((int32_t)(sizeof(POLY3_A)     / sizeof(POLY3_A[0])))
#define POLY3_B_LEN     ((int32_t)(sizeof(POLY3_B)     / sizeof(POLY3_B[0])))
#define POLY3_C_LEN     ((int32_t)(sizeof(POLY3_C)     / sizeof(POLY3_C[0])))

/* ─── Scalar helpers. */

static inline float fabsf_local(float x) { return x < 0.0f ? -x : x; }
static inline int   isfinite_f(float x)  { return x == x && x != INFINITY && x != -INFINITY; }
static inline float fmaxf2(float a, float b) { return a > b ? a : b; }
static inline float fminf2(float a, float b) { return a < b ? a : b; }

/* safe_eval — returns 1 and writes y if (curve, x) is in domain and finite;
 * 0 otherwise. Mirrors the JS safeEval `number | null` contract without using
 * NaN as a sentinel (we want to round-trip NaN values for log-out-of-domain
 * separately from "in domain but not finite"). */
static int safe_eval(const curve_t *c, float x, float *out_y) {
    if (!curve_in_domain(c, x)) return 0;
    float y = curve_evaluate(c, x);
    if (!isfinite_f(y)) return 0;
    *out_y = y;
    return 1;
}

static int safe_diff(const curve_t *c1, const curve_t *c2, float x, float *out_diff) {
    float y1, y2;
    if (!safe_eval(c1, x, &y1)) return 0;
    if (!safe_eval(c2, x, &y2)) return 0;
    *out_diff = y1 - y2;
    return 1;
}

/* Bisect for the x where (c1 - c2) crosses zero between [lo, hi].
 * Mirrors intersection-solver.ts:bisect: same iteration cap formula
 * (max(20, ceil(log2((hi - lo) / EPS)))) but log2 is computed via logf
 * to keep the iteration count bit-deterministic. */
static float bisect_pair(const curve_t *c1, const curve_t *c2, float lo, float hi) {
    /* log2 via logf — JS uses Math.log2 which is also implementation-defined,
     * but here both sides hit the same musl logf so the iteration count is
     * pinned. Math.ceil → ceilf. */
    float ratio = (hi - lo) / EPS;
    int   iter_log;
    if (ratio <= 1.0f) iter_log = 0;
    else iter_log = (int)ceilf(logf(ratio) / logf(2.0f));
    int iterations = iter_log < 20 ? 20 : iter_log;

    for (int i = 0; i < iterations; i++) {
        float mid = (lo + hi) * 0.5f;
        float mid_diff, lo_diff;
        if (!safe_diff(c1, c2, mid, &mid_diff) || !safe_diff(c1, c2, lo, &lo_diff)) {
            lo = mid;
            continue;
        }
        if (mid_diff * lo_diff < 0.0f) hi = mid;
        else                            lo = mid;
    }
    return (lo + hi) * 0.5f;
}

/* ─── Phase 3.1 — find_pair_intersections.
 * Sign-change scan over (c1 - c2) on [x_min, x_max] with bisection refinement.
 * Boundary roots (|diff| < EPS at x_min or x_max) are reported explicitly.
 *
 * The output buffer must hold up to (x_max - x_min)/step + 4 entries; the
 * bridge sizes it generously and passes max_out so the C side cannot overrun. */
int32_t find_pair_intersections(
    const curve_t *c1,
    const curve_t *c2,
    float          x_min,
    float          x_max,
    float          step,
    float         *out_xs,
    int32_t        max_out
) {
    int32_t count = 0;
    float prev_diff = 0.0f;
    int   prev_valid = safe_diff(c1, c2, x_min, &prev_diff);
    if (prev_valid && fabsf_local(prev_diff) < EPS && count < max_out) {
        out_xs[count++] = x_min;
    }
    for (float x = x_min + step; x <= x_max; x += step) {
        float diff;
        if (!safe_diff(c1, c2, x, &diff)) {
            prev_valid = 0;
            continue;
        }
        if (prev_valid && prev_diff * diff < 0.0f && count < max_out) {
            out_xs[count++] = bisect_pair(c1, c2, x - step, x);
        }
        prev_diff = diff;
        prev_valid = 1;
    }
    float end_diff;
    if (safe_diff(c1, c2, x_max, &end_diff) && fabsf_local(end_diff) < EPS) {
        if (count == 0 || fabsf_local(out_xs[count - 1] - x_max) > EPS) {
            if (count < max_out) out_xs[count++] = x_max;
        }
    }
    return count;
}

/* ─── Phase 3.2 — find_all_curves_common_point.
 * Scan the first two curves for pairwise intersections, then for each candidate
 * x check that every other curve agrees within COMMON_PT_TOL. Mirrors the JS
 * implementation including the "use 100·EPS tolerance, not EPS" widening. */
int32_t find_all_curves_common_point(
    const curve_t *curves,
    int32_t        curve_count,
    float          x_min,
    float          x_max,
    float          step,
    float         *out_xs,
    float         *out_ys,
    int32_t        max_out
) {
    if (curve_count < 2) return 0;

    /* Allocate a pair-intersection scratch on the local stack. The maximum
     * possible count is (x_max - x_min)/step + 4; with the level generator's
     * grid (28 wide) and 0.05 step that's at most ~564 entries. We cap at 1024. */
    enum { PAIR_BUF = 1024 };
    float pair_xs[PAIR_BUF];
    int32_t pair_count = find_pair_intersections(
        &curves[0], &curves[1], x_min, x_max, step, pair_xs, PAIR_BUF
    );

    int32_t out_count = 0;
    for (int32_t k = 0; k < pair_count; k++) {
        float ix = pair_xs[k];
        float y0;
        if (!safe_eval(&curves[0], ix, &y0)) continue;
        int all_match = 1;
        for (int32_t i = 2; i < curve_count; i++) {
            float yi;
            if (!safe_eval(&curves[i], ix, &yi)) { all_match = 0; break; }
            if (fabsf_local(yi - y0) > COMMON_PT_TOL) { all_match = 0; break; }
        }
        if (all_match && out_count < max_out) {
            out_xs[out_count] = ix;
            out_ys[out_count] = y0;
            out_count++;
        }
    }
    return out_count;
}

/* Convenience wrapper used by the level generator's disclosure-region check. */
int32_t count_common_intersections_in_interval(
    const curve_t *curves,
    int32_t        curve_count,
    float          x_min,
    float          x_max
) {
    enum { OUT_BUF = 64 };
    float out_xs[OUT_BUF], out_ys[OUT_BUF];
    return find_all_curves_common_point(
        curves, curve_count, x_min, x_max, SCAN_STEP, out_xs, out_ys, OUT_BUF
    );
}

/* ─── Phase 3.3 — spawn calculator.
 * For each curve, walk outward from P* in both directions; on the first
 * crossing of a grid edge or a domain boundary, emit a spawn point. Mirrors
 * spawn-calculator.ts almost verbatim (boundary-bisection logic too). */

#define EDGE_TOP    0u
#define EDGE_BOTTOM 1u
#define EDGE_LEFT   2u
#define EDGE_RIGHT  3u

static int in_playable_y(float y) {
    return isfinite_f(y) && y >= GRID_MIN_Y && y <= GRID_MAX_Y;
}

/* Bisect for the x where the curve transitions from in-domain (with y in
 * [GRID_MIN_Y, GRID_MAX_Y]) to out-of-domain. Returns 1 + populates *out
 * on success, 0 on failure. */
static int bisect_domain_exit(
    const curve_t *c,
    float in_x,
    float out_x,
    spawn_t *out
) {
    float lo = in_x;
    float hi = out_x;
    for (int i = 0; i < BISECT_ITERATIONS; i++) {
        float mid = (lo + hi) * 0.5f;
        if (curve_in_domain(c, mid)) {
            float my = curve_evaluate(c, mid);
            if (isfinite_f(my) && in_playable_y(my)) lo = mid;
            else hi = mid;
        } else {
            hi = mid;
        }
    }
    if (!curve_in_domain(c, lo)) return 0;
    float y = curve_evaluate(c, lo);
    if (!in_playable_y(y)) return 0;
    out->x = lo;
    out->y = y;
    out->edge = (out_x > in_x) ? EDGE_RIGHT : EDGE_LEFT;
    return 1;
}

/* Bisect for x in [lo_x, hi_x] where curve(x) = target_y. */
static float bisect_for_y(
    const curve_t *c,
    float lo_x,
    float hi_x,
    float lo_y,
    float target_y
) {
    float a = lo_x;
    float b = hi_x;
    float fa = lo_y - target_y;
    for (int i = 0; i < BISECT_ITERATIONS; i++) {
        float m = (a + b) * 0.5f;
        if (!curve_in_domain(c, m)) { a = m; continue; }
        float ym = curve_evaluate(c, m);
        if (!isfinite_f(ym)) { a = m; continue; }
        float fm = ym - target_y;
        if (fa * fm <= 0.0f) {
            b = m;
        } else {
            a = m;
            fa = fm;
        }
    }
    return (a + b) * 0.5f;
}

/* march_one_direction — walk a curve outward from start_x in dir_sign (+1/-1)
 * until it leaves the grid. Returns 1 + populates *out on success.
 * Mirrors spawn-calculator.ts:marchOneDirection. */
static int march_one_direction(
    const curve_t *c,
    float start_x,
    int   dir_sign,
    spawn_t *out
) {
    float x_stop = (dir_sign > 0) ? GRID_MAX_X : GRID_MIN_X;

    if (!curve_in_domain(c, start_x)) return 0;
    float start_y = curve_evaluate(c, start_x);
    if (!in_playable_y(start_y)) return 0;

    float prev_x = start_x;
    float prev_y = start_y;

    for (float step = SCAN_STEP; ; step += SCAN_STEP) {
        float x = start_x + (float)dir_sign * step;
        int reached = (dir_sign > 0) ? (x >= x_stop) : (x <= x_stop);
        float x_clamped = reached ? x_stop : x;

        if (!curve_in_domain(c, x_clamped)) {
            return bisect_domain_exit(c, prev_x, x_clamped, out);
        }
        float y = curve_evaluate(c, x_clamped);
        if (!isfinite_f(y)) {
            return bisect_domain_exit(c, prev_x, x_clamped, out);
        }
        if (y < GRID_MIN_Y || y > GRID_MAX_Y) {
            float target_y = (y > GRID_MAX_Y) ? GRID_MAX_Y : GRID_MIN_Y;
            float x_hit = bisect_for_y(c, prev_x, x_clamped, prev_y, target_y);
            out->x = x_hit;
            out->y = target_y;
            out->edge = (target_y == GRID_MAX_Y) ? EDGE_TOP : EDGE_BOTTOM;
            return 1;
        }
        if (reached) {
            out->x = x_clamped;
            out->y = y;
            out->edge = (dir_sign > 0) ? EDGE_RIGHT : EDGE_LEFT;
            return 1;
        }
        prev_x = x_clamped;
        prev_y = y;
        /* Defensive: bail out if step has overflowed the grid by a lot. The
         * original JS loop has no upper bound but is bounded by the
         * x_clamped/reached invariant; preserve that bound here too but
         * guarantee termination if some pathological input slips through. */
        if (step > (GRID_MAX_X - GRID_MIN_X) * 2.0f) return 0;
    }
}

int32_t compute_spawn_points(
    const curve_t *curves,
    int32_t        curve_count,
    float          endpoint_x,
    float          endpoint_y,
    spawn_t       *out_spawns,
    int32_t        max_out
) {
    (void)endpoint_y;  /* march starts from the curve's value at endpoint_x; y unused */
    int32_t count = 0;
    for (int32_t ci = 0; ci < curve_count; ci++) {
        spawn_t right;
        if (march_one_direction(&curves[ci], endpoint_x, +1, &right) && count < max_out) {
            right.curve_index = ci;
            right.side = +1;
            out_spawns[count++] = right;
        }
        spawn_t left;
        if (march_one_direction(&curves[ci], endpoint_x, -1, &left) && count < max_out) {
            left.curve_index = ci;
            left.side = -1;
            out_spawns[count++] = left;
        }
    }
    return count;
}

/* ─── Phase 4 — full level generator. */

/* Pick a dyadic value in [lo, hi] by integer index — consumes exactly one
 * rng draw. Mirrors pickDyadic in level-generator.ts. */
static float pick_dyadic(float lo, float hi, prng_t *rng) {
    int32_t steps = (int32_t)((hi - lo) / RATIONAL_QUANTUM + 0.5f);
    int32_t idx   = (int32_t)(prng_next_f64(rng) * (double)(steps + 1));
    return lo + (float)idx * RATIONAL_QUANTUM;
}

/* Pick one element from a dyadic candidate list — consumes exactly one rng
 * draw. Mirrors pickFrom in level-generator.ts. prng_next_f64 returns a
 * double in [0, 1), so the index stays in [0, len). */
static float pick_from(const float *list, int32_t len, prng_t *rng) {
    return list[(int32_t)(prng_next_f64(rng) * (double)len)];
}

/* Generate a polynomial of given degree (1|2|3) passing through (x0, y0).
 * Returns 1 on success, 0 on bad inputs.
 *
 * Free coefficients are picked by index into the dyadic candidate lists; the
 * constant term is solved from the through-point equation. x0, y0, and every
 * picked coefficient are dyadic with small denominators, so the solved term is
 * exact — the curve passes through P* exactly. The solved term is NOT snapped
 * back to the RATIONAL_QUANTUM grid: a product like slope*x0 legitimately
 * lands on a finer grid (e.g. 1/8, 1/64), and snapping it would move the curve
 * off P*. Mirrors generatePolynomialThrough in level-generator.ts, including
 * the coefficient sampling order that fixes the rng draw schedule. */
static int generate_polynomial_through(
    int32_t degree, float x0, float y0, prng_t *rng, curve_t *out
) {
    out->family = CURVE_FAMILY_POLY;
    switch (degree) {
    case 1: {
        float slope = pick_from(POLY1_SLOPE, POLY1_SLOPE_LEN, rng);
        float intercept = y0 - slope * x0;
        out->variant = 1;
        out->a = slope;
        out->b = intercept;
        out->c = 0.0f;
        out->d = 0.0f;
        return 1;
    }
    case 2: {
        float a = pick_from(POLY2_A, POLY2_A_LEN, rng);
        float b = pick_from(POLY2_B, POLY2_B_LEN, rng);
        float c = y0 - a * x0 * x0 - b * x0;
        out->variant = 2;
        out->a = a;
        out->b = b;
        out->c = c;
        out->d = 0.0f;
        return 1;
    }
    case 3: {
        float a = pick_from(POLY3_A, POLY3_A_LEN, rng);
        float b = pick_from(POLY3_B, POLY3_B_LEN, rng);
        float c = pick_from(POLY3_C, POLY3_C_LEN, rng);
        float d = y0 - a * x0 * x0 * x0 - b * x0 * x0 - c * x0;
        out->variant = 3;
        out->a = a;
        out->b = b;
        out->c = c;
        out->d = d;
        return 1;
    }
    default: return 0;
    }
}

static int verify_slope_separation(const curve_t *curves, int32_t n, float x0) {
    for (int32_t i = 0; i < n; i++) {
        for (int32_t j = i + 1; j < n; j++) {
            float di = curve_derivative(&curves[i], x0);
            float dj = curve_derivative(&curves[j], x0);
            if (!isfinite_f(di) || !isfinite_f(dj)) return 0;
            if (fabsf_local(di - dj) < SLOPE_SEPARATION_THRESHOLD) return 0;
        }
    }
    return 1;
}

static int has_two_spawns_per_curve(const spawn_t *spawns, int32_t spawn_count, int32_t curve_count) {
    if (spawn_count != curve_count * 2) return 0;
    /* Tally left/right per curve_index; small fixed table indexed by ci. */
    int8_t lefts[MAX_CURVES] = {0};
    int8_t rights[MAX_CURVES] = {0};
    for (int32_t i = 0; i < spawn_count; i++) {
        int32_t ci = spawns[i].curve_index;
        if (ci < 0 || ci >= MAX_CURVES) return 0;
        if (spawns[i].side > 0) rights[ci]++;
        else                    lefts[ci]++;
    }
    for (int32_t ci = 0; ci < curve_count; ci++) {
        if (lefts[ci] != 1 || rights[ci] != 1) return 0;
    }
    return 1;
}

static int common_point_inside_y_band(
    const curve_t *curves, int32_t n,
    float x_min, float x_max, float y_min, float y_max
) {
    const curve_t *c0 = &curves[0];
    for (float x = x_min; x <= x_max; x += SCAN_STEP) {
        if (!curve_in_domain(c0, x)) continue;
        float y = curve_evaluate(c0, x);
        if (!isfinite_f(y)) continue;
        if (y < y_min || y > y_max) continue;
        int agree = 1;
        for (int32_t i = 1; i < n; i++) {
            if (!curve_in_domain(&curves[i], x)) { agree = 0; break; }
            float yi = curve_evaluate(&curves[i], x);
            if (!isfinite_f(yi) || fabsf_local(yi - y) > 1.0e-3f) { agree = 0; break; }
        }
        if (agree) return 1;
    }
    return 0;
}

/* find_disclosure_region — try the half-extent ladder; on the first match
 * write the rectangle to (*out_xmin, *out_xmax, *out_ymin, *out_ymax) and
 * return 1. Returns 0 if no half-extent works. */
static int find_disclosure_region(
    const curve_t *curves, int32_t n,
    float x0, float y0,
    float *out_xmin, float *out_xmax,
    float *out_ymin, float *out_ymax
) {
    for (int li = 0; li < DISCLOSURE_LADDER_LEN; li++) {
        float h = DISCLOSURE_HALF_EXTENTS[li];
        float xmin = fmaxf2(GRID_MIN_X, x0 - h);
        float xmax = fminf2(GRID_MAX_X, x0 + h);
        float ymin = fmaxf2(GRID_MIN_Y, y0 - h);
        float ymax = fminf2(GRID_MAX_Y, y0 + h);
        if (xmax - xmin < 0.4f || ymax - ymin < 0.4f) continue;

        int commons = count_common_intersections_in_interval(curves, n, xmin, xmax);
        if (commons != 1) continue;
        if (!common_point_inside_y_band(curves, n, xmin, xmax, ymin, ymax)) continue;

        *out_xmin = xmin; *out_xmax = xmax;
        *out_ymin = ymin; *out_ymax = ymax;
        return 1;
    }
    return 0;
}

/* try_generate_level — one rejection-sampling attempt. Returns 1 on success,
 * 0 on rejection (caller retries). */
static int try_generate_level(
    const int32_t *entries, int32_t n_entries,
    prng_t *rng,
    generated_level_t *out
) {
    if (n_entries < 1 || n_entries > MAX_CURVES) return 0;

    /* P* is a dyadic rational so the displayed equations are exact and the
     * common point is genuinely a fraction the student can derive. A degree-3
     * multiset biases P* toward the origin to keep the cubic on-grid. */
    int has_degree3 = 0;
    for (int32_t i = 0; i < n_entries; i++) {
        if (entries[i] == MULTISET_POLY_DEG_3) { has_degree3 = 1; break; }
    }
    float x_lo = has_degree3 ? fmaxf2(PLAYABLE_X_MIN, -DEGREE3_ENDPOINT_BOUND) : PLAYABLE_X_MIN;
    float x_hi = has_degree3 ? fminf2(PLAYABLE_X_MAX,  DEGREE3_ENDPOINT_BOUND) : PLAYABLE_X_MAX;
    float y_lo = has_degree3 ? fmaxf2(PLAYABLE_Y_MIN, -DEGREE3_ENDPOINT_BOUND) : PLAYABLE_Y_MIN;
    float y_hi = has_degree3 ? fminf2(PLAYABLE_Y_MAX,  DEGREE3_ENDPOINT_BOUND) : PLAYABLE_Y_MAX;
    float x0 = pick_dyadic(x_lo, x_hi, rng);
    float y0 = pick_dyadic(y_lo, y_hi, rng);

    curve_t curves[MAX_CURVES];
    for (int32_t i = 0; i < n_entries; i++) {
        if (!generate_polynomial_through(entries[i], x0, y0, rng, &curves[i])) return 0;
    }
    if (!verify_slope_separation(curves, n_entries, x0)) return 0;

    spawn_t spawns[MAX_SPAWNS];
    int32_t spawn_count = compute_spawn_points(curves, n_entries, x0, y0, spawns, MAX_SPAWNS);
    if (!has_two_spawns_per_curve(spawns, spawn_count, n_entries)) return 0;

    float r_xmin, r_xmax, r_ymin, r_ymax;
    if (!find_disclosure_region(curves, n_entries, x0, y0,
                                 &r_xmin, &r_xmax, &r_ymin, &r_ymax)) return 0;

    /* Path interval: bounding x-range across all spawns + endpoint. */
    float lo = x0, hi = x0;
    for (int32_t i = 0; i < spawn_count; i++) {
        if (spawns[i].x < lo) lo = spawns[i].x;
        if (spawns[i].x > hi) hi = spawns[i].x;
    }

    out->success = 1;
    out->curve_count = n_entries;
    for (int32_t i = 0; i < n_entries; i++) out->curves[i] = curves[i];
    out->endpoint_x = x0;
    out->endpoint_y = y0;
    out->region_x_min = r_xmin;
    out->region_x_max = r_xmax;
    out->region_y_min = r_ymin;
    out->region_y_max = r_ymax;
    out->interval_lo = lo;
    out->interval_hi = hi;
    out->spawn_count = spawn_count;
    for (int32_t i = 0; i < spawn_count; i++) out->spawns[i] = spawns[i];
    return 1;
}

int32_t generate_level(
    int32_t           star_rating,
    prng_t           *rng_state,
    const int32_t    *multiset_entries,
    int32_t           multiset_len,
    generated_level_t *out
) {
    (void)star_rating;  /* multiset selection happens TS-side; star is metadata only */
    if (out == 0 || rng_state == 0 || multiset_entries == 0) return 0;
    out->success = 0;
    out->curve_count = 0;
    out->spawn_count = 0;

    for (int b = 0; b < MAX_BATCHES; b++) {
        for (int a = 0; a < ATTEMPTS_PER_BATCH; a++) {
            if (try_generate_level(multiset_entries, multiset_len, rng_state, out)) {
                return 1;
            }
        }
    }
    return 0;
}
