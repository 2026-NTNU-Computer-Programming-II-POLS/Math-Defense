/**
 * math_engine.c — 數學運算核心
 * 透過 Emscripten 編譯為 WebAssembly，在瀏覽器中執行。
 * 所有遊戲中的數學運算（砲彈軌跡、扇形面積、矩陣、積分、傅立葉）
 * 都經由此模組計算。
 *
 * 編譯指令：
 * emcc math_engine.c -o math_engine.js \
 *   -s EXPORTED_FUNCTIONS='["_matrix_multiply","_calculate_trajectory","_sector_coverage","_point_in_sector","_numerical_integrate","_fourier_composite","_fourier_match","_line_circle_intersect"]' \
 *   -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap"]' \
 *   -s MODULARIZE=1 \
 *   -s EXPORT_NAME='createMathEngine' \
 *   -O2
 */

#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

/* ══════════════════════════════════════════
 *  矩陣乘法：矩陣連結塔的線性變換
 * ══════════════════════════════════════════ */

/**
 * 2x2 矩陣乘法 result = a × b
 * 矩陣以 row-major 一維陣列傳入：[a00, a01, a10, a11]
 */
void matrix_multiply(const float *a, const float *b, float *result) {
    result[0] = a[0] * b[0] + a[1] * b[2];
    result[1] = a[0] * b[1] + a[1] * b[3];
    result[2] = a[2] * b[0] + a[3] * b[2];
    result[3] = a[2] * b[1] + a[3] * b[3];
}

/* ══════════════════════════════════════════
 *  軌跡計算：函數砲的砲彈路徑
 * ══════════════════════════════════════════ */

/**
 * 計算多項式 y = a*x^2 + b*x + c 在指定區間的座標點
 *
 * @param a, b, c   多項式係數（一次函數時 a=0）
 * @param x_start   起始 x
 * @param x_end     結束 x
 * @param step      步長
 * @param out_x     輸出 x 座標陣列（呼叫方需預先分配）
 * @param out_y     輸出 y 座標陣列
 * @param count     輸出：實際點數
 */
/* Convert a float sample count into a safe int in [0, max_n].
   Isolated so reverse-range behaviour (dir=-1) and the NaN/overflow clamp are
   covered by a single code path and can be unit-tested independently of the
   rest of trajectory generation. Returns 0 for NaN or negative inputs. */
static int clamp_sample_count(float nf, int max_n) {
    if (!(nf >= 0.0f)) return 0;            /* also traps NaN */
    if (nf > (float)max_n) return max_n;
    return (int)nf;
}

void calculate_trajectory(float a, float b, float c,
                          float x_start, float x_end, float step,
                          float *out_x, float *out_y, int *count) {
    /* Index-based iteration so float accumulation rounding can't drop the final point. */
    float dir = (x_end >= x_start) ? 1.0f : -1.0f;
    if (step <= 0.0f) { *count = 0; return; }

    /* Clamp the float-domain sample count to [0, 1000] before the int cast.
       Without this, a near-zero step or huge range produces a float that exceeds
       INT_MAX, and casting an out-of-range float to int is undefined behaviour in C
       (the JS fallback is safe via Math.min, so they'd diverge on extreme inputs). */
    float nf = floorf((x_end - x_start) * dir / step) + 1.0f;
    int n = clamp_sample_count(nf, 1000);

    for (int i = 0; i < n; i++) {
        float x = x_start + (float)i * step * dir;
        out_x[i] = x;
        out_y[i] = a * x * x + b * x + c;
    }

    *count = n;
}

/* ══════════════════════════════════════════
 *  扇形覆蓋面積：雷達掃描塔
 * ══════════════════════════════════════════ */

/**
 * 計算扇形面積
 * @param radius       半徑
 * @param angle_width  弧寬（弧度）
 * @return 扇形面積
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
 * 判斷點是否在扇形內
 * @param px, py        點座標
 * @param cx, cy        圓心座標
 * @param radius        半徑
 * @param angle_start   起始角（弧度）
 * @param angle_width   弧寬（弧度）
 * @return 1 if inside, 0 if outside
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
 *  定積分近似（梯形法）：積分砲
 * ══════════════════════════════════════════ */

/**
 * 用梯形法計算多項式 f(x) = ax^2 + bx + c 在 [lo, hi] 的定積分
 *
 * @param coeff_a, coeff_b, coeff_c  多項式係數
 * @param lo     積分下界
 * @param hi     積分上界
 * @param n      分割數
 * @return 近似積分值
 */
float numerical_integrate(float coeff_a, float coeff_b, float coeff_c,
                          float lo, float hi, int n) {
    if (n <= 0) n = 100;
    float h = (hi - lo) / (float)n;
    float sum = 0.0f;

    for (int i = 0; i <= n; i++) {
        float x = lo + i * h;
        float y = coeff_a * x * x + coeff_b * x + coeff_c;
        y = fabsf(y);  /* 面積取絕對值 */

        if (i == 0 || i == n) {
            sum += y;
        } else {
            sum += 2.0f * y;
        }
    }

    return fabsf(sum * h / 2.0f);
}

/* ══════════════════════════════════════════
 *  傅立葉合成：傅立葉破盾
 * ══════════════════════════════════════════ */

/**
 * 計算三個 sin 波的疊加值
 * f(t) = A1*sin(ω1*t) + A2*sin(ω2*t) + A3*sin(ω3*t)
 *
 * @param t      時間參數
 * @param freqs  頻率陣列 [ω1, ω2, ω3]
 * @param amps   振幅陣列 [A1, A2, A3]
 * @return 合成值
 */
float fourier_composite(float t, const float *freqs, const float *amps) {
    return amps[0] * sinf(freqs[0] * t)
         + amps[1] * sinf(freqs[1] * t)
         + amps[2] * sinf(freqs[2] * t);
}

/**
 * 計算兩個傅立葉波形的匹配度（0~1）
 * 在 [0, 2π] 區間取樣比較
 *
 * @param freqs1, amps1  Boss 的波形參數
 * @param freqs2, amps2  玩家的波形參數
 * @param samples        取樣數
 * @return 匹配度 0.0 ~ 1.0
 */
float fourier_match(const float *freqs1, const float *amps1,
                    const float *freqs2, const float *amps2,
                    int samples) {
    if (samples <= 0) samples = 200;

    /* Nyquist gate: in the [0, 2π] window, dt = 2π/samples, so the discretely
       representable angular frequency is bounded by samples/2. If either
       waveform carries a higher ω, aliasing folds its energy onto lower
       components and the score collapses — in the boss shield mini-game that
       makes the fight effectively unwinnable. Bump samples to 4×max_ω for a
       2× oversample margin over the Nyquist rate. */
    float max_freq = 0.0f;
    for (int i = 0; i < 3; i++) {
        float f1 = freqs1[i]; if (f1 < 0.0f) f1 = -f1;
        float f2 = freqs2[i]; if (f2 < 0.0f) f2 = -f2;
        if (f1 > max_freq) max_freq = f1;
        if (f2 > max_freq) max_freq = f2;
    }
    int min_samples = (int)(4.0f * max_freq) + 1;
    if (samples < min_samples) samples = min_samples;

    float totalError = 0.0f;
    float totalEnergy = 0.0f;
    float dt = 2.0f * (float)M_PI / (float)samples;

    for (int i = 0; i < samples; i++) {
        float t = i * dt;
        float v1 = fourier_composite(t, freqs1, amps1);
        float v2 = fourier_composite(t, freqs2, amps2);
        float diff = v1 - v2;
        totalError += diff * diff;
        totalEnergy += v1 * v1;
    }

    if (totalEnergy < 0.001f) return 1.0f;  /* 都是零波形 */

    /* Clamp ratio before sqrtf — under -ffast-math a stray negative ratio
       would yield NaN, which then propagates through clamp comparisons
       (NaN < 0 is false, NaN > 1 is false) and into bossShieldTimer. */
    float ratio = totalError / totalEnergy;
    if (ratio < 0.0f) ratio = 0.0f;
    if (ratio > 1.0f) ratio = 1.0f;
    float match = 1.0f - sqrtf(ratio);
    if (match < 0.0f) match = 0.0f;
    if (match > 1.0f) match = 1.0f;

    return match;
}

/* ══════════════════════════════════════════
 *  輔助：直線與圓的交點（函數砲命中判定）
 * ══════════════════════════════════════════ */

/**
 * 直線 y = mx + b 與圓心 (cx, cy) 半徑 r 的交點數
 * 交點座標寫入 out_x[], out_y[]
 * @return 交點數 (0, 1, 或 2)
 */
int line_circle_intersect(float m, float b, float cx, float cy, float r,
                          float *out_x, float *out_y) {
    /* 代入：m*x + b = y → (x - cx)^2 + (mx + b - cy)^2 = r^2
       展開為 (1+m^2)x^2 + 2(m(b-cy) - cx)x + (cx^2 + (b-cy)^2 - r^2) = 0 */
    float A = 1.0f + m * m;
    float B = 2.0f * (m * (b - cy) - cx);
    float C = cx * cx + (b - cy) * (b - cy) - r * r;
    float disc = B * B - 4.0f * A * C;

    if (disc < 0) return 0;

    /* Tangent case: disc ~ 0. The 1e-6 absolute threshold is appropriate for
       radii ≤ O(100) in game-space units; disc scales like A·r², so for very
       large r (> 1000) any float roundoff dwarfs 1e-6 and this branch becomes
       effectively dead — the two-root branch below then produces two nearly
       coincident points, which downstream hit-detection already deduplicates. */
    if (disc < 1e-6f) {
        out_x[0] = -B / (2.0f * A);
        out_y[0] = m * out_x[0] + b;
        return 1;
    }

    float sqrtDisc = sqrtf(disc);
    out_x[0] = (-B + sqrtDisc) / (2.0f * A);
    out_y[0] = m * out_x[0] + b;
    out_x[1] = (-B - sqrtDisc) / (2.0f * A);
    out_y[1] = m * out_x[1] + b;
    return 2;
}
