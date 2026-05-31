// Scenario 2 — auth churn.
//
// Stresses the most expensive write path the auth system has: bcrypt password
// hashing on register + login, refresh-token rotation, and token-denylist
// writes on logout. bcrypt is deliberately slow (CPU-bound), so this scenario
// finds the point where auth saturates CPU well before the DB does.
//
// Each iteration uses a FRESH unique email (per-VU + per-iter) so it never
// trips the per-email login throttle (10/min) or the per-account lockout
// (5 failures). A unique X-Forwarded-For per VU keeps the per-IP register
// (5/min) and login (10/min) limits from collapsing into one shared bucket.
//
//   k6 run -e BASE_URL=http://backend:8000 02-auth-flow.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, SEED_PASS, baseHeaders } from './lib/config.js';
import { authHeaders } from './lib/auth.js';

const QUICK = __ENV.VUS || __ENV.DURATION;
const auth_churn = QUICK
  ? { executor: 'constant-vus', vus: parseInt(__ENV.VUS || '10', 10), duration: __ENV.DURATION || '30s' }
  : {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '20s', target: 0 },
      ],
    };

export const options = {
  scenarios: { auth_churn },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:POST /api/auth/login}': ['p(95)<1500'], // bcrypt-bound
  },
};

export default function () {
  // Unique, collision-free email per iteration of this VU.
  const email = `churn_${__VU}_${__ITER}_${Date.now()}@stress.invalid`;
  const headers = baseHeaders();

  // 1) Register (202, enumeration-safe).
  const reg = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({ email, password: SEED_PASS, player_name: `c${__VU}x${__ITER}`, role: 'student' }),
    { headers, tags: { name: 'POST /api/auth/register' } },
  );
  check(reg, { 'register 202': (r) => r.status === 202 });

  // 2) Login → sets auth + refresh + csrf cookies in this VU's jar.
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password: SEED_PASS }),
    { headers, tags: { name: 'POST /api/auth/login' } },
  );
  const ok = check(login, { 'login 200': (r) => r.status === 200 });
  if (!ok) {
    sleep(1);
    return;
  }

  // 3) Refresh — rotates the access + refresh tokens. CSRF-required when the
  //    refresh cookie is present, hence authHeaders() (echoes csrf_token).
  const refresh = http.post(`${BASE_URL}/api/auth/refresh`, null, {
    headers: authHeaders(),
    tags: { name: 'POST /api/auth/refresh' },
  });
  check(refresh, { 'refresh 200': (r) => r.status === 200 });

  // 4) Logout — denylists the access JTI + consumes the refresh family.
  const logout = http.post(`${BASE_URL}/api/auth/logout`, null, {
    headers: authHeaders(),
    tags: { name: 'POST /api/auth/logout' },
  });
  check(logout, { 'logout 204': (r) => r.status === 204 });

  sleep(1);
}
