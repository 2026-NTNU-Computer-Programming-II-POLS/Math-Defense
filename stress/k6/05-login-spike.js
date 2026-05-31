// Scenario 5 — login thundering herd (spike).
//
// Models the one case 04-peak-100 deliberately spreads out: a whole class
// hitting "log in" within a few seconds (the 9:00 bell). Login is the only
// request, fired by a wide burst of VUs, so it concentrates bcrypt — the CPU
// cost that 04 never stresses because there each player logs in once and the
// arrival is ramped.
//
// Uses `shared-iterations`: SPIKE_LOGINS distinct logins drained by SPIKE_VUS
// VUs as fast as possible → a sharp concurrent burst. Each login uses a
// DISTINCT pool user so the per-email throttle (10/min — independent of
// RATELIMIT_ENABLED) does NOT fire; we want raw bcrypt-under-burst, not the
// throttle. If SPIKE_LOGINS > USER_COUNT the indices wrap and some logins may
// legitimately get 429 (the throttle defending) — those are counted, not
// treated as server failures.
//
//   k6 run -e BASE_URL=http://localhost:8001 -e USER_COUNT=200 05-login-spike.js
//
// Knobs: SPIKE_VUS (burst width, default 150), SPIKE_LOGINS (total, default = USER_COUNT).

import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE_URL, USER_COUNT, SEED_PASS, baseHeaders, poolEmail } from './lib/config.js';

const SPIKE_VUS = parseInt(__ENV.SPIKE_VUS || '150', 10);
const SPIKE_LOGINS = parseInt(__ENV.SPIKE_LOGINS || String(USER_COUNT), 10);

export const options = {
  scenarios: {
    login_spike: {
      executor: 'shared-iterations',
      vus: SPIKE_VUS,
      iterations: SPIKE_LOGINS,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // The pass/fail gate for a SPIKE is "did the server stay up", not latency.
    // Login latency is SUPPOSED to climb under a concentrated burst, so gating
    // on p95 produces false failures (especially when the load generator is
    // co-located with the backend). A 5xx fails this check (200/429 both pass),
    // so a server that actually buckles still exits non-zero. Login p95 is still
    // reported in the run summary for information — read it, don't gate on it.
    checks: ['rate>0.99'],
  },
};

const throttled = new Counter('logins_throttled');     // 429 — per-email throttle fired
const serverErrors = new Counter('login_server_errors'); // 5xx — the thing we care about

export default function () {
  const i = exec.scenario.iterationInTest;
  const email = poolEmail(i % USER_COUNT);
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password: SEED_PASS }),
    { headers: baseHeaders(), tags: { name: 'POST /api/auth/login' } },
  );
  check(res, { 'login ok (200) or throttled (429), not 5xx': (r) => r.status === 200 || r.status === 429 });
  if (res.status === 429) throttled.add(1);
  if (res.status >= 500) serverErrors.add(1);
}
