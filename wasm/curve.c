/**
 * curve.c — Bit-deterministic curve evaluator for level-generator parity.
 *
 * Mirrors frontend/src/math/curve-evaluator.ts with one substantive change:
 * sinf/cosf/logf compile through musl libc into the WASM bytecode, so cross-
 * engine ULP drift on transcendentals (the dominant source of replay-score
 * disagreement today) cannot enter the result. With -fno-fast-math /
 * -ffp-contract=off (set in wasm/Makefile), the compiler also cannot fuse
 * FMAs or rewrite the expression tree.
 *
 * Wire format is `curve_t` (24 bytes). The TS bridge marshals
 * CurveDefinition → curve_t into a singleton scratch buffer; the C side
 * reads it through this header so a struct-layout drift is caught at link
 * time rather than at runtime.
 *
 * Family tags and polynomial degrees match the multiset encoding documented
 * in construction plan §3.3 / Appendix B.3.
 */

#include <math.h>
#include <stdint.h>

#include "curve.h"

/* Polynomial: a..d are coefficients[0..3] in descending degree order. The
 * lower-degree variants leave higher-index slots untouched, but since they
 * never read them this is harmless. */
static float poly_eval(const curve_t *c, float x) {
    switch (c->variant) {
    case 1: return c->a * x + c->b;
    case 2: return c->a * x * x + c->b * x + c->c;
    case 3: return c->a * x * x * x + c->b * x * x + c->c * x + c->d;
    default: return 0.0f;  /* ABI-misuse fence */
    }
}

static float poly_deriv(const curve_t *c, float x) {
    switch (c->variant) {
    case 1: return c->a;
    case 2: return 2.0f * c->a * x + c->b;
    case 3: return 3.0f * c->a * x * x + 2.0f * c->b * x + c->c;
    default: return 0.0f;
    }
}

/* Trig: y = a · fn(b·x + c) + d, where fn is sin (variant 0) or cos (variant 1).
 * Inner-form keeps b and c independent, matching the JS implementation. */
static float trig_eval(const curve_t *c, float x) {
    float inner = c->b * x + c->c;
    float base = (c->variant == 0u) ? sinf(inner) : cosf(inner);
    return c->a * base + c->d;
}

static float trig_deriv(const curve_t *c, float x) {
    float inner = c->b * x + c->c;
    /* d/dx [a sin(b x + c)] = a · b · cos(...)
     * d/dx [a cos(b x + c)] = -a · b · sin(...) */
    float base = (c->variant == 0u) ? cosf(inner) : -sinf(inner);
    return c->a * c->b * base;
}

/* Log: y = a · ln(b·x + c) + d. Domain check (arg > 0) is the caller's
 * responsibility for the level generator, but evaluate must still return
 * NaN at out-of-domain x so accidental calls produce a recognisable error
 * value rather than silent garbage. */
static float log_eval(const curve_t *c, float x) {
    float arg = c->b * x + c->c;
    if (arg <= 0.0f) return NAN;
    return c->a * logf(arg) + c->d;
}

static float log_deriv(const curve_t *c, float x) {
    float arg = c->b * x + c->c;
    if (arg <= 0.0f) return NAN;
    return (c->a * c->b) / arg;
}

float curve_evaluate(const curve_t *c, float x) {
    switch (c->family) {
    case CURVE_FAMILY_POLY: return poly_eval(c, x);
    case CURVE_FAMILY_TRIG: return trig_eval(c, x);
    case CURVE_FAMILY_LOG:  return log_eval(c, x);
    default: return 0.0f;
    }
}

float curve_derivative(const curve_t *c, float x) {
    switch (c->family) {
    case CURVE_FAMILY_POLY: return poly_deriv(c, x);
    case CURVE_FAMILY_TRIG: return trig_deriv(c, x);
    case CURVE_FAMILY_LOG:  return log_deriv(c, x);
    default: return 0.0f;
    }
}

/* Returns 1 if x is in the curve's natural domain, 0 otherwise. Polynomials
 * and trig functions are defined everywhere; log requires b·x + c > 0. */
int32_t curve_in_domain(const curve_t *c, float x) {
    if (c->family != CURVE_FAMILY_LOG) return 1;
    return (c->b * x + c->c > 0.0f) ? 1 : 0;
}
