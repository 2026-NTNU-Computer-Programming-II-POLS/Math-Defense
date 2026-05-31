// Scenario 3 — game-session write load.
//
// Drives the full authoritative session lifecycle the real client produces
// during a game:
//   POST   /api/sessions                  create (201)
//   PATCH  /api/sessions/{id}             in-flight wave/score sync (x N)
//   POST   /api/sessions/{id}/end         finalize → server recomputes score
//                                         AND writes the leaderboard entry
//
// Note: end_session is the canonical completion — it records the leaderboard
// placement itself, so there is no separate POST /api/leaderboard step (that
// endpoint 409s "Score already submitted" once end has run).
//
// This is the heaviest DB write path: INSERTs + UPDATEs under row locks plus
// the server-side score recompute. It exercises connection-pool contention and
// the with_for_update paths that SQLite-based tests can't surface.
//
//   k6 run -e BASE_URL=http://backend:8000 -e USER_COUNT=200 03-session-lifecycle.js
//
// NOTE on score verification: sessions are created as replay_version=1 (legacy
// ε-tolerance path) so the server-side recompute accepts the client figures
// without bit-exact WASM parity. end/submit checks are recorded but NOT made
// fatal — a rejection here is itself a useful signal, not a script bug.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, USER_COUNT, SEED_PASS, poolEmail } from './lib/config.js';
import { establishSession, authHeaders } from './lib/auth.js';

const QUICK = __ENV.VUS || __ENV.DURATION;
const session_writes = QUICK
  ? { executor: 'constant-vus', vus: parseInt(__ENV.VUS || '10', 10), duration: __ENV.DURATION || '30s' }
  : {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 30 },
        { duration: '2m', target: 30 },
        { duration: '30s', target: 0 },
      ],
    };

export const options = {
  scenarios: { session_writes },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:POST /api/sessions}': ['p(95)<500'],
    'http_req_duration{name:PATCH /api/sessions/{id}}': ['p(95)<400'],
  },
};

const endedSessions = new Counter('sessions_completed');
const rejectedEnds = new Counter('session_end_rejected');

export default function () {
  const idx = (__VU - 1) % USER_COUNT;
  if (!establishSession(poolEmail(idx), SEED_PASS)) {
    sleep(1);
    return;
  }

  // 1) Create a session (v1, star 1).
  const create = http.post(
    `${BASE_URL}/api/sessions`,
    JSON.stringify({ star_rating: 1, replay_version: 1 }),
    { headers: authHeaders(), tags: { name: 'POST /api/sessions' } },
  );
  if (!check(create, { 'session created (201)': (r) => r.status === 201 })) {
    sleep(1);
    return;
  }
  const session = create.json();
  const id = session.id;

  // 2) Simulate in-flight wave sync: a handful of PATCHes with monotonically
  //    increasing score (the aggregate rejects a score below the last value).
  let score = 0;
  let killValue = 0;
  // star_rating=1 → level 1, whose anti-cheat caps are 3 waves / 50 kills /
  // 5000 score (backend/app/domain/constraints.py). Stay within them so end
  // isn't rejected with a 422 domain error.
  const waves = 3;
  for (let w = 1; w <= waves; w++) {
    score += 120;
    killValue += 80;
    const patch = http.patch(
      `${BASE_URL}/api/sessions/${id}`,
      JSON.stringify({ current_wave: w, score, kill_value: killValue, cost_total: w * 30 }),
      { headers: authHeaders(), tags: { name: 'PATCH /api/sessions/{id}' } },
    );
    check(patch, { 'patch 200': (r) => r.status === 200 });
    sleep(0.2); // ~200ms between wave syncs, like real play
  }

  // 3) End the session. Omit score so the server uses its authoritative
  //    last-synced value (the modern v2 client does the same).
  const end = http.post(
    `${BASE_URL}/api/sessions/${id}/end`,
    JSON.stringify({ kills: 40, waves_survived: waves }),
    { headers: authHeaders(), tags: { name: 'POST /api/sessions/{id}/end' } },
  );
  if (check(end, { 'session ended (200)': (r) => r.status === 200 })) {
    endedSessions.add(1);
  } else {
    rejectedEnds.add(1);
  }

  sleep(1);
}
