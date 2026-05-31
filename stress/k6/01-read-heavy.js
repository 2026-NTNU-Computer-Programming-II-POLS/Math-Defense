// Scenario 1 — read-heavy load.
//
// Models the steady-state of a classroom session: many authenticated clients
// polling leaderboards, their own history, and their active session. These are
// the cheapest endpoints (GETs that hit indexed reads), so this is the script
// that pushes the highest RPS and exercises the DB connection pool + read path.
//
// Each VU logs in ONCE (in the per-VU init via the first iteration guard) and
// then loops the read endpoints, reusing its cookie jar.
//
//   k6 run -e BASE_URL=http://backend:8000 -e USER_COUNT=200 01-read-heavy.js
//
// Tune load with the standard k6 flags or the stages below.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, USER_COUNT, SEED_PASS, baseHeaders, poolEmail } from './lib/config.js';
import { establishSession } from './lib/auth.js';

// Setting VUS or DURATION switches to a flat constant-VU profile for a quick
// smoke run; otherwise the realistic ramping profile is used.
const QUICK = __ENV.VUS || __ENV.DURATION;
const read_heavy = QUICK
  ? { executor: 'constant-vus', vus: parseInt(__ENV.VUS || '10', 10), duration: __ENV.DURATION || '30s' }
  : {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    };

export const options = {
  scenarios: { read_heavy },
  thresholds: {
    http_req_failed: ['rate<0.01'],          // < 1% errors
    'http_req_duration{name:GET /api/leaderboard}': ['p(95)<400'],
    'http_req_duration{name:GET /api/auth/me}': ['p(95)<300'],
  },
};

const leaderboardLatency = new Trend('leaderboard_latency', true);

export default function () {
  // Authenticate once, then re-inject the cached session each iteration
  // (k6 clears the cookie jar between iterations).
  const idx = (__VU - 1) % USER_COUNT;
  if (!establishSession(poolEmail(idx), SEED_PASS)) {
    // Could not authenticate (pool not seeded). Skip rather than hammer 401s.
    sleep(1);
    return;
  }

  const headers = baseHeaders();

  // Global leaderboard, page 1 — the hottest public read.
  const lb = http.get(`${BASE_URL}/api/leaderboard?page=1&per_page=20`, {
    headers,
    tags: { name: 'GET /api/leaderboard' },
  });
  leaderboardLatency.add(lb.timings.duration);
  check(lb, { 'leaderboard 200': (r) => r.status === 200 });

  // Per-level leaderboard (level 1..5 round-robined by iteration).
  const level = (__ITER % 5) + 1;
  http.get(`${BASE_URL}/api/leaderboard?level=${level}&page=1&per_page=20`, {
    headers,
    tags: { name: 'GET /api/leaderboard?level' },
  });

  // Authenticated reads.
  const me = http.get(`${BASE_URL}/api/auth/me`, { headers, tags: { name: 'GET /api/auth/me' } });
  check(me, { 'me 200': (r) => r.status === 200 });

  http.get(`${BASE_URL}/api/leaderboard/me?page=1&per_page=50`, {
    headers,
    tags: { name: 'GET /api/leaderboard/me' },
  });

  http.get(`${BASE_URL}/api/sessions/active`, {
    headers,
    tags: { name: 'GET /api/sessions/active' },
  });

  sleep(1); // model human pacing; remove for a raw-capacity probe
}
