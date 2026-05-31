// One-shot pool seeder. Run BEFORE the load scenarios so they have a stable
// set of accounts to log in as:
//
//   k6 run -e USER_COUNT=200 seed-users.js
//
// Registration is enumeration-safe (always 202) and unverified accounts can
// still log in (auth_service.login does not gate on is_email_verified), so a
// registered pool user is immediately usable by 01-read-heavy / 03-session.
//
// Each registration uses a UNIQUE X-Forwarded-For so the per-IP register limit
// (5/min) never becomes the bottleneck — the stress backend trusts XFF
// (PROXY_MODE=true). Re-running is harmless: an existing email returns the
// same 202.

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { BASE_URL, SEED_PASS, USER_COUNT, poolEmail } from './lib/config.js';

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: 20,
      iterations: USER_COUNT,
      maxDuration: '5m',
    },
  },
  // Seeding is setup, not a measured run — don't fail the suite on it.
  thresholds: {},
};

export default function () {
  const i = exec.scenario.iterationInTest; // 0 .. USER_COUNT-1, unique
  // Unique synthetic IP per registration to dodge the 5/min per-IP cap.
  const ip = `10.200.${(i >> 8) & 255}.${(i & 255) || 1}`;
  const res = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email: poolEmail(i),
      password: SEED_PASS,
      player_name: `stress${i}`,
      role: 'student',
    }),
    {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      tags: { name: 'POST /api/auth/register (seed)' },
    },
  );
  check(res, { 'register accepted (202)': (r) => r.status === 202 });
}

export function handleSummary(data) {
  const reg = data.metrics['http_reqs'];
  return {
    stdout: `\nSeeded up to ${USER_COUNT} pool users (stress_user_0..${USER_COUNT - 1}@stress.invalid).\n`
      + `Total register requests: ${reg ? reg.values.count : '?'}\n`,
  };
}
