/**
 * math_engine.c — Math computation core.
 * Compiled to WebAssembly via Emscripten and called from the browser.
 * Backs the V2 tower mechanics: matrix transforms (Matrix tower),
 * sector coverage / point-in-sector hit tests (Radar A/B/C towers),
 * and trapezoid-rule integration (Calculus tower).
 *
 * Build is driven by wasm/Makefile — see EXPORTED_FUNCTIONS there for the
 * authoritative export list.
 */

#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* ══════════════════════════════════════════
 *  Matrix multiplication: Matrix tower linear transforms
 * ══════════════════════════════════════════ */

/**
 * 2x2 matrix multiply: result = a × b.
 * Matrices arrive as row-major flat arrays: [a00, a01, a10, a11].
 */
void matrix_multiply(const float *a, const float *b, float *result) {
    result[0] = a[0] * b[0] + a[1] * b[2];
    result[1] = a[0] * b[1] + a[1] * b[3];
    result[2] = a[2] * b[0] + a[3] * b[2];
    result[3] = a[2] * b[1] + a[3] * b[3];
}

/* ══════════════════════════════════════════
 *  Sector coverage and hit-test: Radar towers
 * ══════════════════════════════════════════ */

/**
 * Sector area = ½ · r² · θ.
 * @param radius       Sector radius
 * @param angle_width  Arc width in radians
 * @return             Sector area
 */
float sector_coverage(float radius, float angle_width) {
    /* Clamp to [0, 2π] so future buff stacks pushing past a full circle don't return
       garbage area > π·r² that breaks coverage % UI. */
    const float TWO_PI = 2.0f * (float)M_PI;
    if (angle_width < 0.0f) angle_width = 0.0f;
    if (angle_width > TWO_PI) angle_width = TWO_PI;
    return 0.5f * radius * radius * angle_width;
}

/**
 * Test whether a point lies inside a circular sector.
 * @param px, py        Point coordinates
 * @param cx, cy        Sector centre
 * @param radius        Sector radius
 * @param angle_start   Start angle in radians
 * @param angle_width   Arc width in radians
 * @return              1 if inside, 0 if outside
 */
int point_in_sector(float px, float py, float cx, float cy,
                    float radius, float angle_start, float angle_width) {
    /* Clamp to [0, 2π] for parity with sector_coverage. Widths > 2π would wrap
       once and falsely exclude valid points; negative widths yield end < start
       and always return 0. */
    const float TWO_PI_CLAMP = 2.0f * (float)M_PI;
    if (angle_width < 0.0f) angle_width = 0.0f;
    if (angle_width > TWO_PI_CLAMP) angle_width = TWO_PI_CLAMP;

    float dx = px - cx;
    float dy = py - cy;
    float dist = sqrtf(dx * dx + dy * dy);

    if (dist > radius) return 0;

    float angle = atan2f(dy, dx);
    if (angle < 0) angle += 2.0f * (float)M_PI;

    float start = fmodf(angle_start, 2.0f * (float)M_PI);
    if (start < 0) start += 2.0f * (float)M_PI;

    float end = start + angle_width;

    float eps = 1e-6f;

    if (end > 2.0f * (float)M_PI) {
        return (angle >= start - eps || angle <= end - 2.0f * (float)M_PI + eps) ? 1 : 0;
    }

    return (angle >= start - eps && angle <= end + eps) ? 1 : 0;
}

/* ══════════════════════════════════════════
 *  Bit-deterministic pow: scoring formula
 * ══════════════════════════════════════════ */

/**
 * Bit-deterministic pow via musl's pow compiled into WASM bytecode.
 * score-calculator.ts uses this for totalScore = max(0, k)^exponent so the
 * displayed score agrees with the server-side wasmtime-py recomputation
 * (anti-cheat). Falls back to Math.pow on browsers without WASM, in which
 * case the score may drift by a last-ULP and the server-side verifier
 * absorbs the difference within its tolerance band.
 */
double power_f64(double base, double exp) {
    return pow(base, exp);
}

/* ══════════════════════════════════════════
 *  Trapezoid-rule integration: Calculus tower
 * ══════════════════════════════════════════ */

/**
 * Trapezoid-rule approximation of ∫[lo, hi] (a·x² + b·x + c) dx.
 * Each sample's |y| is taken before the sum so the result is the area
 * between the curve and the x-axis (not the signed integral).
 *
 * @param coeff_a, coeff_b, coeff_c  Polynomial coefficients
 * @param lo  Lower bound
 * @param hi  Upper bound
 * @param n   Subdivision count (defaulted to 100 if non-positive)
 * @return    Approximate area under |f(x)| over [lo, hi]
 */
float numerical_integrate(float coeff_a, float coeff_b, float coeff_c,
                          float lo, float hi, int n) {
    if (n <= 0) n = 100;
    float h = (hi - lo) / (float)n;
    float sum = 0.0f;

    for (int i = 0; i <= n; i++) {
        float x = lo + i * h;
        float y = coeff_a * x * x + coeff_b * x + coeff_c;
        y = fabsf(y);

        if (i == 0 || i == n) {
            sum += y;
        } else {
            sum += 2.0f * y;
        }
    }

    return fabsf(sum * h / 2.0f);
}
