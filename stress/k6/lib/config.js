// Shared config + helpers for the Math Defense k6 stress suite.
//
// Every script imports from here so the base URL, the synthetic-IP scheme,
// and the CSRF round-trip live in one place.
//
// Env vars (all optional, sensible defaults for the stress compose):
//   BASE_URL   target origin                  (default http://backend:8000)
//   SEED_PASS  password for pre-seeded users   (default StressTest2026!)
//   USER_COUNT size of the pre-seeded pool      (default 200)

export const BASE_URL = __ENV.BASE_URL || 'http://backend:8000';
export const SEED_PASS = __ENV.SEED_PASS || 'StressTest2026!';
export const USER_COUNT = parseInt(__ENV.USER_COUNT || '200', 10);

// Deterministic e-mail for a given pool index so seed + run scripts agree
// without sharing state. The `stress.invalid` TLD is reserved (RFC 2606) so
// these addresses can never collide with a real inbox.
export function poolEmail(i) {
  return `stress_user_${i}@stress.invalid`;
}

// Per-VU synthetic client IP. The stress backend runs with PROXY_MODE=true and
// TRUSTED_PROXY_IPS covering the compose subnet, so it trusts X-Forwarded-For
// from the k6 container and keys per-IP rate limits on THIS value instead of
// the single k6 source address. Without this, every VU shares one rate-limit
// bucket and slowapi throttles the whole test at ~10-120 req/min.
//
// __VU is 1-based and unique per virtual user; this maps it into 10.x.y.z.
export function syntheticIp() {
  const vu = __VU || 1;
  return `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${(vu & 255) || 1}`;
}

// Headers every request should carry under the stress profile.
export function baseHeaders(extra) {
  return Object.assign(
    {
      'X-Forwarded-For': syntheticIp(),
      'Content-Type': 'application/json',
    },
    extra || {},
  );
}
