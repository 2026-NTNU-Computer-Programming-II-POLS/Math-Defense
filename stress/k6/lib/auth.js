// Auth helpers for the k6 stress suite.
//
// The backend issues the access JWT as an HttpOnly cookie and a non-HttpOnly
// `csrf_token` cookie (double-submit). k6's per-VU cookie jar stores both
// automatically; we only need to (a) read csrf_token back out of the jar and
// (b) echo it in the X-CSRF-Token header on state-changing requests.
//
// In the stress compose CSRF is disabled (CI=true unlocks CSRF_ENABLED=false),
// so the header is a no-op there — but keeping it means the same scripts also
// work against a CSRF-enabled target unchanged.

import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, SEED_PASS, baseHeaders, poolEmail } from './config.js';

// Pull the current csrf_token cookie out of this VU's jar.
export function csrfToken() {
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL + '/api');
  return cookies.csrf_token ? cookies.csrf_token[0] : '';
}

// Headers for a mutating, authenticated request: base headers + CSRF echo.
export function authHeaders(extra) {
  return baseHeaders(Object.assign({ 'X-CSRF-Token': csrfToken() }, extra || {}));
}

// Log in a pre-seeded pool user. Returns true on success. The cookie jar
// retains the auth + csrf cookies for the rest of the VU's iteration.
export function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password: password || SEED_PASS }),
    { headers: baseHeaders(), tags: { name: 'POST /api/auth/login' } },
  );
  return check(res, { 'login 200': (r) => r.status === 200 });
}

// Register a brand-new account (enumeration-safe 202). Used by the auth-churn
// scenario, which needs a fresh email per iteration to dodge the per-email
// login throttle (10/min) and per-account lockout.
export function register(email, password, playerName, role) {
  const res = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      email,
      password: password || SEED_PASS,
      player_name: playerName || email.split('@')[0].slice(0, 20),
      role: role || 'student',
    }),
    { headers: baseHeaders(), tags: { name: 'POST /api/auth/register' } },
  );
  return check(res, { 'register 202': (r) => r.status === 202 });
}

// VU-scoped cache of the cookie VALUES issued at first login. k6 RESETS the
// per-VU cookie jar at the start of every iteration, so a "log in once and
// reuse" pattern silently loses the session after iteration 0 (the jar is
// empty → 401). JS module/VU-scope variables DO persist across iterations,
// so we stash the issued cookies here and re-inject them into each fresh jar.
let _sessionCookies = null;

// Ensure this iteration's jar carries a valid authenticated session. On the
// first call it logs in (one bcrypt verify) and captures the issued cookies;
// every later iteration just re-injects the cached values — no re-login.
// Returns true once the jar is authenticated.
export function establishSession(email, password) {
  const jar = http.cookieJar();
  if (_sessionCookies) {
    for (const name of Object.keys(_sessionCookies)) {
      jar.set(BASE_URL + '/api', name, _sessionCookies[name]);
    }
    return true;
  }
  if (!login(email, password)) return false;
  const c = jar.cookiesForURL(BASE_URL + '/api');
  _sessionCookies = {};
  // access_token authenticates; csrf_token is needed for mutations when CSRF
  // is enabled (no-op in the stress env, but keeps the scripts portable).
  for (const name of ['access_token', 'csrf_token']) {
    if (c[name]) _sessionCookies[name] = c[name][0];
  }
  return true;
}
