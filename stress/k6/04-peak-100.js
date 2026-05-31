// Scenario 4 — peak mixed-workload load (~100 concurrent players, slightly severe).
//
// Unlike 01/02/03 (each hammers ONE endpoint to isolate a subsystem), this
// models a realistic busy moment: ~100 students all actively PLAYING at once.
// One VU = one player who logs in once, then loops full play-throughs:
//
//   GET  /api/sessions/active        resume check
//   POST /api/sessions               start a game
//   PATCH /api/sessions/{id} × WAVES high-frequency in-game wave sync
//   POST /api/sessions/{id}/end      finish (also writes the leaderboard row)
//   GET  /api/leaderboard            check ranking
//   GET  /api/auth/me                (every 5th game) profile refresh
//
// The load profile is deliberately a notch harsher than "exactly 100 relaxed
// players": fast arrival (login burst), short think times, and a brief
// overshoot to 130 to probe headroom past the nominal target.
//
//   ── IMPORTANT ───────────────────────────────────────────────────────────
//   Run the LOAD GENERATOR ON A DIFFERENT MACHINE from the backend. At 100 VUs
//   k6 itself is CPU-hungry; co-locating it with backend+postgres on one box
//   measures the box, not the app. See stress/README.md "Peak".
//   ────────────────────────────────────────────────────────────────────────
//
// Full run (needs a seeded pool of >=100 users — run seed-users.js first):
//   k6 run -e BASE_URL=http://backend:8000 -e USER_COUNT=200 04-peak-100.js
//
// Tuning knobs:
//   THINK      seconds between games          (default 0.7 — lower = harsher)
//   PATCH_GAP  seconds between wave syncs      (default 0.35)
//   VUS/DURATION  set either to switch to a flat constant-VUs smoke profile

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, USER_COUNT, SEED_PASS, baseHeaders, poolEmail } from './lib/config.js';
import { establishSession, authHeaders } from './lib/auth.js';

const THINK = parseFloat(__ENV.THINK || '0.7');
const PATCH_GAP = parseFloat(__ENV.PATCH_GAP || '0.35');
// star_rating=1 → level 1 anti-cheat caps: 3 waves / 50 kills / 5000 score.
const WAVES = 3;

// Setting VUS or DURATION switches to a flat smoke profile (validate the script
// at small scale before committing to the full 10-minute peak run).
const QUICK = __ENV.VUS || __ENV.DURATION;
const peak_play = QUICK
  ? { executor: 'constant-vus', vus: parseInt(__ENV.VUS || '15', 10), duration: __ENV.DURATION || '30s' }
  : {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '60s', target: 100 },  // arrival — spreads the login/bcrypt burst over a minute
        { duration: '7m', target: 100 },   // sustained 100 players at high frequency
        { duration: '60s', target: 130 },  // overshoot — probe headroom past nominal peak
        { duration: '60s', target: 100 },  // settle back
        { duration: '30s', target: 0 },    // drain
      ],
      gracefulRampDown: '15s',
    };

export const options = {
  scenarios: { peak_play },
  // Slightly strict gates: the run exits non-zero if any is breached. They flag
  // regressions without aborting mid-run (so you still get the full picture).
  // Latency bounds are advisory on a shared box — trust them only when the load
  // generator runs on separate hardware from the backend.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{name:GET /api/leaderboard}': ['p(95)<600'],
    'http_req_duration{name:POST /api/sessions}': ['p(95)<900'],
    'http_req_duration{name:PATCH /api/sessions/{id}}': ['p(95)<700'],
    'http_req_duration{name:POST /api/sessions/{id}/end}': ['p(95)<1500'],
  },
};

const gamesCompleted = new Counter('games_completed');
const gameDuration = new Trend('game_duration_ms', true);

export default function () {
  const idx = (__VU - 1) % USER_COUNT;
  // Authenticate once per VU; re-inject the cached session each iteration
  // (k6 clears the cookie jar between iterations — see lib/auth.js).
  if (!establishSession(poolEmail(idx), SEED_PASS)) {
    sleep(1);
    return;
  }

  const gameStart = Date.now();

  // Resume check (the SPA does this on load / after a reload).
  http.get(`${BASE_URL}/api/sessions/active`, {
    headers: baseHeaders(),
    tags: { name: 'GET /api/sessions/active' },
  });

  // Start a game.
  const create = http.post(
    `${BASE_URL}/api/sessions`,
    JSON.stringify({ star_rating: 1, replay_version: 1 }),
    { headers: authHeaders(), tags: { name: 'POST /api/sessions' } },
  );
  if (!check(create, { 'session created (201)': (r) => r.status === 201 })) {
    sleep(THINK);
    return;
  }
  const id = create.json('id');

  // Play the waves with high-frequency state syncs (monotonic score — the
  // aggregate rejects a score below the last reported value).
  let score = 0;
  let killValue = 0;
  for (let w = 1; w <= WAVES; w++) {
    score += 120;
    killValue += 80;
    const patch = http.patch(
      `${BASE_URL}/api/sessions/${id}`,
      JSON.stringify({ current_wave: w, score, kill_value: killValue, cost_total: w * 30 }),
      { headers: authHeaders(), tags: { name: 'PATCH /api/sessions/{id}' } },
    );
    check(patch, { 'patch 200': (r) => r.status === 200 });
    sleep(PATCH_GAP);
  }

  // Finish — omit score so the server uses its authoritative value; end also
  // records the leaderboard placement (no separate submit — that would 409).
  const end = http.post(
    `${BASE_URL}/api/sessions/${id}/end`,
    JSON.stringify({ kills: 40, waves_survived: WAVES }),
    { headers: authHeaders(), tags: { name: 'POST /api/sessions/{id}/end' } },
  );
  if (check(end, { 'session ended (200)': (r) => r.status === 200 })) {
    gamesCompleted.add(1);
    gameDuration.add(Date.now() - gameStart);
  }

  // Check the ranking after the game; refresh profile occasionally.
  http.get(`${BASE_URL}/api/leaderboard?level=1&page=1&per_page=20`, {
    headers: baseHeaders(),
    tags: { name: 'GET /api/leaderboard' },
  });
  if (__ITER % 5 === 0) {
    http.get(`${BASE_URL}/api/auth/me`, { headers: baseHeaders(), tags: { name: 'GET /api/auth/me' } });
  }

  sleep(THINK); // think time between games
}
