/**
 * curve.h — Wire format and public ABI for the curve evaluator.
 *
 * `curve_t` is a fixed-size 24-byte record. The TS bridge writes one of
 * these into a scratch buffer and passes the pointer in by ccall. Field
 * widths are pinned to <stdint.h> types so emcc (wasm32), host clang
 * (x86_64), and a future Wasmtime host all agree on the layout.
 *
 * Family/variant encoding matches the multiset wire format described in
 * construction plan §3.3 / Appendix B.3 — keep them in sync with the bridge's
 * writeCurveTo and the multiset entries (1/2/3, 100/101, 200).
 */

#ifndef MD_CURVE_H
#define MD_CURVE_H

#include <stdint.h>

#define CURVE_FAMILY_POLY  0u
#define CURVE_FAMILY_TRIG  1u
#define CURVE_FAMILY_LOG   2u

typedef struct {
    uint32_t family;     /* 0=poly, 1=trig, 2=log */
    uint32_t variant;    /* poly: degree (1|2|3); trig: 0=sin,1=cos; log: 0 */
    float    a, b, c, d; /* polynomial uses up to 4 (a..d ≡ coeffs[0..3]) */
} curve_t;               /* 24 bytes, fixed */

float   curve_evaluate   (const curve_t *c, float x);
float   curve_derivative (const curve_t *c, float x);
int32_t curve_in_domain  (const curve_t *c, float x);

#endif /* MD_CURVE_H */
