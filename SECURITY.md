# Security

This document describes the security design of Math Defense, explains known limitations honestly, and provides guidance for operators deploying the application. This is an educational game project maintained by a small team; it does not claim enterprise-grade security hardening, but does aim to follow reasonable practices for an internet-facing web application.

---

## Reporting a Vulnerability

If you discover a security issue, please report it responsibly by opening a GitHub issue marked **[Security]** in the title, or by emailing the maintainer directly. Do not include exploit code or credentials in a public issue; describe the class of vulnerability and the affected component. We will try to respond within a few days, though response time may vary as this is a student project.

---

## Supported Versions

Only the latest commit on `main` is actively maintained. Older tags or branches receive no security backports.

---

## Security Architecture Overview

The application is a Vue 3 single-page application backed by a FastAPI REST API and a PostgreSQL database. In production it is intended to run behind nginx, which terminates TLS and adds HTTP security headers. The backend follows a domain-driven design with three distinct layers (Domain, Application, Infrastructure) and uses SQLAlchemy exclusively for database access.

---

## Authentication

### Access Tokens and Cookies

Authentication uses short-lived JWT access tokens (15-minute expiry by default, configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`). Tokens are delivered as `HttpOnly`, `SameSite=Lax` cookies. The `Secure` flag is enforced at startup: attempting to disable it outside of the CI/test harness causes the application to refuse to start.

Tokens carry the following claims, all of which are validated at decode time:

| Claim | Purpose |
|---|---|
| `sub` | User ID |
| `iss` / `aud` | Issuer and audience binding (prevents cross-service token reuse) |
| `jti` | Unique token ID used for revocation |
| `exp` / `iat` | Expiry and issued-at timestamps |
| `pv` | Password version; incremented on password change to invalidate old tokens |

The signing algorithm is pinned to `HS256` in the decode call; the library's default of accepting any algorithm advertised in the token header is explicitly overridden.

### Refresh Tokens

A separate long-lived refresh token (30-day expiry by default, configurable via `REFRESH_TOKEN_EXPIRE_DAYS`) is issued on login, registration, and MFA challenge completion. The raw token is delivered as a second `HttpOnly`, `Secure`, `SameSite=Lax` cookie; only a SHA-256 hash of the token is stored server-side in the `refresh_tokens` table. Refresh tokens are rotated on every successful `/api/auth/refresh` call: the previous hash is invalidated and a new raw token replaces the cookie. On logout, both the access-token `jti` and the active refresh token hash are revoked.

If the same refresh token is presented twice (typically because an attacker has captured the cookie and the legitimate client has already used it, or vice versa), the second use is detected as a reuse event. When this happens, **every** refresh token for that user is revoked inside the same transaction before the error is returned to the client, forcing the legitimate user to re-authenticate but preventing the attacker from minting any further access tokens. Password changes likewise revoke the user's entire refresh-token family in addition to incrementing `password_version`.

### Token Revocation

On logout, the token's `jti` is inserted into a persistent PostgreSQL deny-list table with its expiry timestamp. A background janitor task (`_auth_store_janitor`, started from the app lifespan) runs every 10 minutes and bulk-deletes both expired deny-list rows (`expires_at <= now`) and stale `login_attempts` rows in one transaction, so neither table grows on the hot insertion/read path. This means revocation survives application restarts. `is_denied()` filters on `expires_at > now` at read time, so an expired row is never treated as a live revocation even before the janitor removes it.

Password changes increment the user's `password_version` field. Any token whose `pv` claim does not match the current value is rejected at the dependency level before reaching route handlers.

### Account Lockout

After five consecutive failed login attempts within a five-minute window, the account is locked. The lockout duration escalates with each successive lockout: 5 minutes for the first, 15 minutes for the second, and 60 minutes for every lockout thereafter (tracked by `login_attempts.lockout_count`). The lockout state is stored in the database and updated with a PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` statement to avoid race conditions under concurrent login attempts. A dummy bcrypt comparison is performed for usernames that do not exist, so response timing does not reveal whether an account exists. In addition to per-IP rate limiting, an in-process per-email throttle (10 attempts/minute) is applied at the login route so that a single IP cannot mask attacks against a specific account by spreading them across many usernames.

### Password Hashing

Passwords are hashed with bcrypt at a cost factor of 12. Input is truncated to 72 bytes before hashing to avoid a bcrypt-specific issue where bytes beyond the 72-byte limit are silently ignored.

### Multi-Factor Authentication (TOTP)

Users may optionally enrol a TOTP authenticator (`totp_secret`, `mfa_enabled` columns). The `totp_secret` column stores the user's TOTP seed encrypted at rest with **AES-128-CBC + HMAC-SHA256** via `cryptography`'s Fernet, keyed by `TOTP_ENCRYPTION_KEY` (32 url-safe base64 bytes). The key is validated at startup by `verify_key_configured()` in the lifespan handler, so a missing or malformed key aborts boot rather than failing on the first MFA-related request. Decryption failures raise loudly rather than silently returning the ciphertext, so a rotated or corrupt key surfaces immediately instead of locking users out of MFA without diagnostics. When a user with MFA enabled completes the password check, the login route does not issue an access cookie directly; instead it returns a short-lived **MFA challenge JWT** (5-minute TTL) that the client must exchange for an access token by submitting a fresh TOTP code to `/api/auth/mfa/challenge`.

Two guards protect this flow:

- **Challenge-token reuse**: on a successful verification the challenge token's `jti` is inserted into the deny-list inside the same transaction that issues the new access cookie. A captured challenge token cannot be re-exchanged with a different code.
- **TOTP step-replay**: the `totp_last_used_at` column records the timestamp of the most recent accepted code; codes presented within a 90-second window of a prior success are rejected. This defends against an attacker who intercepts a code in transit and races the legitimate user.

### Email Verification Tokens

Verification tokens are emitted at registration and on resend requests. Only a SHA-256 hash of each token is stored in `email_verification_tokens`; the raw token appears only in the outbound email link. Tokens are single-use (consumed atomically via a `used` boolean), expire after 24 hours, and any pending tokens for the user are invalidated when a new one is issued. This bounds the damage if an old verification email is later exposed.

---

## Input Validation

All request bodies are parsed through Pydantic v2 models with `extra="forbid"`, meaning unknown fields are rejected with HTTP 422 rather than silently discarded. Response schemas use `extra="ignore"`, which has no security impact because they describe outbound payloads only. One input schema — `PathConfig` in `app/schemas/territory.py` — deliberately uses `extra="allow"` so that designer-supplied path configurations can carry extension fields; the values it accepts are stored as opaque JSON and never executed.

Key field-level validations:

- **Password (schema)**: minimum 8 characters, maximum 72 bytes, must contain at least one letter and one digit.
- **Password (application layer)**: after passing the cheap schema checks and the per-route rate limiter, the registration and password-change flows run a `zxcvbn` strength check and reject any password whose score is below 2. This catches common passwords, dictionary words, keyboard walks, and trivial repetition patterns. The expensive `zxcvbn` call is deliberately placed after the rate limiter so it cannot be used as a CPU-amplification lever against unauthenticated POSTs.
- **Email**: validated and normalized by the `Email` value object (lowercase, format and length checks) and checked for uniqueness at registration.
- **Player name**: trimmed of whitespace, 1–50 characters.
- **Avatar URL**: validated against a strict whitelist of six known SVG paths under `/avatars/`; arbitrary URLs are rejected.
- **TOTP code**: must match `^\d{6}$` (exactly six digits) on every MFA enrolment, challenge, and disable request.
- **Endpoint-marker style / hit-FX**: the `PUT /api/auth/profile/endpoint-marker` body accepts only `style ∈ {star, gorilla, custom}` and `hit_fx ∈ {random, fragments, crying, angry}` (whitelists in `domain/user/constraints.py`).
- **Endpoint-marker custom image (`endpoint_marker_custom_dataurl`)**: this is the one user-supplied free-form field on the profile and is validated in depth rather than stored as opaque text. The Pydantic schema (`EndpointMarkerUpdateRequest`) fast-rejects on prefix and length (must start with `data:image/png;base64,` or `data:image/jpeg;base64,`, max 3 MiB). The `User` aggregate (`update_endpoint_marker`) then re-validates everything as the canonical source of truth: it base64-decodes with `validate=True`, confirms the decoded bytes start with the declared format's magic-byte sentinel (PNG `\x89PNG\r\n\x1a\n` / JPEG `\xff\xd8\xff`), and for PNGs parses the IHDR chunk to reject declared dimensions above 1024×1024 (a decompression-bomb guard). No image library (Pillow) is invoked and the bytes are never decoded or rendered server-side — they are stored as a string and only ever echoed back to the owner's own client, so the value is not a server-side XSS or RCE surface. The 3 MiB cap and per-route rate limit bound storage-inflation abuse.

These validations are applied at the schema boundary and re-enforced in the domain aggregate, not only in the database layer.

---

## SQL Injection

The application uses SQLAlchemy's ORM and Core expression language for the overwhelming majority of database interactions. A small number of hand-written `text()` statements exist for operations the ORM does not express cleanly — PostgreSQL advisory locks (`pg_advisory_lock` for migration serialisation, `pg_advisory_xact_lock` in the session and territory repositories) and `SELECT ... FOR UPDATE` row locks in the competency-state and talent repositories. Every one of these binds its inputs as named parameters (`:uid`, `:id`, `:a`, `:s`); none interpolates a user-controlled value into the SQL string, so they are not an injection surface. Parameterized queries are used throughout, including the PostgreSQL-specific `INSERT ... ON CONFLICT` statements in the login guard and token deny-list. No SQL string is built by concatenating untrusted input.

---

## Game Integrity

Because the application is a competitive game with a public leaderboard, score and progression endpoints have to assume that any value sent by the client may have been tampered with. The backend is designed so that score-bearing fields are never trusted from the client:

- **Append-only session event log**: every meaningful in-game action is persisted to `session_events` as a JSONB row with an explicit `seq` field assigned client-side. A `UNIQUE(session_id, seq)` constraint makes retried flushes idempotent. The event log feeds replay/spectate playback and ad-hoc post-game verification rather than primary scoring.
- **Server-side score validation**: the score formula is implemented in WebAssembly (`math_engine.wasm`) and shipped to both sides. The backend loads it through `wasmtime-py` and recomputes the authoritative `total_score` from scalar fields persisted on the `game_sessions` row (kill value, time totals, costs, starting/ending health, the initial answer, etc.). On v2 (strict) sessions a mismatch between client-declared and server-recomputed score raises `ReplayMismatchError`; on v1 sessions the mismatch is logged. In both cases the server overwrites the persisted score with its own recomputation before the value reaches the leaderboard.
- **Deterministic RNG seed**: `game_sessions.rng_seed` is fixed when the session is created. The score formula itself does not consume the seed; the seed exists so that the recorded event log can be replayed deterministically for spectator/audit purposes.
- **Leaderboard submissions use only server-side values**: `/leaderboard/submit` reads the score, kills, and waves_survived from the locked session row, never from the request body, so a tampered client cannot raise its own score even if it passes earlier checks.
- **Duplicate-submission guards**: the session row is locked with `SELECT ... FOR UPDATE` before the duplicate check, and a database-level `UNIQUE` constraint on `leaderboard.session_id` is the final safety net. Concurrent submissions from the same session are serialised and only one row reaches the leaderboard.
- **Achievements, talents, and progression**: these are computed server-side from the same session state and the user's persisted progression; the client cannot grant itself an achievement or skill point by sending a crafted request.

---

## CSRF Protection

The application implements the double-submit cookie pattern for CSRF protection. A random token is set in a `csrf_token` cookie and must also appear in the `X-CSRF-Token` request header on all state-mutating requests. The token is refreshed on every response.

CSRF protection is enabled by default. Attempting to disable it outside of the CI/test harness causes the application to refuse to start. `SameSite=Lax` cookies provide a second layer of defence for modern browsers, but the explicit CSRF check is retained because `SameSite` alone does not cover all older browsers or all cross-origin navigation patterns.

---

## CORS

Allowed origins are read from the `CORS_ORIGINS` environment variable (comma-separated). The application validates that each entry begins with `http://` or `https://` and contains a non-empty hostname. An empty list causes the application to refuse to start.

`Access-Control-Allow-Credentials: true` is set, so origins must be an explicit list rather than a wildcard. The allowed headers are limited to `Authorization`, `Content-Type`, and `X-CSRF-Token`.

---

## Rate Limiting

Per-IP rate limits are enforced via `slowapi`. The auth-critical endpoints are listed here; the full table (sessions, leaderboard, achievements, talents, challenges, etc.) is in `backend/README.md`.

| Endpoint | Limit |
|---|---|
| `POST /api/auth/register` | 5 requests/minute |
| `POST /api/auth/login` | 10 requests/minute |
| `POST /api/auth/logout` | 30 requests/minute |
| `POST /api/auth/refresh` | 30 requests/minute |
| `POST /api/auth/change-password` | 5 requests/minute |
| `POST /api/auth/mfa/setup` \| `mfa/confirm` \| `mfa/disable` | 5 requests/minute |
| `POST /api/auth/mfa/challenge` | 10 requests/minute |
| `GET /api/auth/verify-email` | 10 requests/minute |
| `POST /api/auth/resend-verification` | 3 requests/minute |
| `GET /api/auth/me` | 30 requests/minute |

---

## HTTP Security Headers

nginx applies the following security headers to all responses in the production configuration. A `SecurityHeadersMiddleware` in the FastAPI app independently re-asserts the subset that is safe to set everywhere (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, plus `Cache-Control: no-store` on `/api/auth/*`), so even direct backend access — for example via the dev compose port — still carries those baseline headers. HSTS, COOP, CORP, and CSP are applied by nginx only and rely on the production deployment topology. HSTS, COOP, and CORP live in the shared `security-headers.conf` `include`, which is pulled into both the plain-HTTP `nginx.conf` server block and the TLS `nginx-tls.conf` block, so these headers are emitted by either nginx config; the CSP `add_header` is declared inline in each server block (it is not part of the shared include).

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Disables camera, microphone, geolocation, and payment |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${API_ORIGIN}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` |
| `Cache-Control` | `no-store` on `/api/auth/*` responses |

The CSP forbids inline scripts, plugins, object embedding, and framing (`frame-ancestors 'none'` reinforces `X-Frame-Options: DENY`); `wasm-unsafe-eval` is required for the WebAssembly score engine. Inline styles are still permitted (see Known Limitations).

Additional nginx hardening:

- `server_tokens off` suppresses the nginx version from response headers and error pages.
- `client_max_body_size 1m` rejects oversized request bodies before they reach the backend.
- The TLS server accepts only TLS 1.2 and TLS 1.3 with an explicit cipher list, and serves an OCSP-stapled certificate.

---

## Secret Management

The following values must be set via environment variables or an `.env` file and are validated at startup:

| Variable | Requirement |
|---|---|
| `SECRET_KEY` | Minimum 32 characters; used to sign JWTs. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | Must use the `postgresql+psycopg` scheme; the application rejects URLs containing the literal password `changeme` in non-test environments |
| `CORS_ORIGINS` | One or more valid HTTP/HTTPS origins |
| `FRONTEND_URL` | Absolute `http://` or `https://` URL used in outbound email links |
| `POSTGRES_PASSWORD` | Used by Docker Compose for the admin role; must be a strong random value |
| `POSTGRES_APP_PASSWORD` | Used by `pg_init_roles.sh` to create the least-privilege `mathdefense_app` role on first DB init; consumed at runtime only when `DATABASE_URL_APP` is also set |
| `DATABASE_URL_APP` | Optional. When set, the runtime engine connects with the DML-only `mathdefense_app` role while Alembic keeps migrating as the admin `DATABASE_URL`. Same `postgresql+psycopg` scheme + `changeme` rejection as `DATABASE_URL`. Unset/blank → runtime also uses `DATABASE_URL` |
| `TOTP_ENCRYPTION_KEY` | Fernet key (32 url-safe base64-encoded bytes) encrypting TOTP secrets at rest. Validated by `verify_key_configured()` at startup; boot fails fast if missing or malformed |
| `PROXY_MODE` / `TRUSTED_PROXY_IPS` | When the backend runs behind nginx, set `PROXY_MODE=true` and list the proxy's IPs/CIDR blocks (e.g. `172.16.0.0/12`) so the rate limiter keys on the real client IP via `X-Forwarded-For` |

The application detects whether `SECRET_KEY` came from the process environment or an `.env` file at startup and logs a one-line confirmation that the key was loaded; missing values are logged at `ERROR` (and Pydantic also raises before the log line is reached). Changing the secret key invalidates all issued JWTs immediately.

**Important for operators**: The `.env` file must not be committed to version control. The repository provides a `.env.example` template with placeholder values. If real credentials have ever been committed to your repository's history, they should be treated as compromised and rotated, and the history should be cleaned with a tool such as `git-filter-repo`.

---

## Audit Logging

Security-relevant events (login success/failure, registration, password change, MFA enrol/disable, refresh-token reuse detection, etc.) are written to the `audit_logs` table by `audit_logger.record_audit_event`. The writer is designed for forensic durability rather than performance:

- Each event is written on its own SQLAlchemy session and committed independently of the surrounding request transaction, so a business-logic rollback does not also discard the audit trail.
- The captured user-agent is truncated to 512 characters to prevent a malicious client from exhausting storage by sending an oversized header.
- If the insert fails the failure is logged as a warning rather than allowed to break the request, so a transient database issue cannot take down the auth path.

The `audit_logs` table is provisioned by Alembic revision `z0c1d2e3f4a5_create_audit_logs_table.py`, with composite indexes on `(user_id, created_at)` and `(event_type, created_at)` to support forensic queries. `user_id` deliberately has no FK to `users.id` so audit rows survive user deletion.

Separately, the application logger uses a `_anon()` helper that emits only a 10-character SHA-256 prefix of user IDs and email addresses, so failed-login and similar log lines that are shipped off-host do not leak account identifiers in plaintext. The `audit_logs` rows themselves do hold the raw user_id, since they are intended for in-database forensic queries.

## Error Handling

A global exception handler catches any uncaught error, logs the full traceback server-side, and returns a fixed `{"detail": "Internal server error"}` payload with HTTP 500. Stack traces, library versions, and file paths are not surfaced to clients. Pydantic validation errors are returned with the offending field location and error type, but the underlying exception message is sanitised so that library internals do not leak.

## Database Integrity Constraints

PostgreSQL constraints provide a last line of defence below the application-layer checks:

- `CHECK` constraints on `game_sessions` require `score`, `kills`, `waves_survived`, `hp`, and `gold` to be non-negative.
- `CHECK` constraints on `user_competency_state` require `alpha > 0` and `beta > 0` so the spaced-repetition math remains well-defined.
- `UNIQUE` constraints back the security-critical token tables: `denied_tokens.jti` (deny-list), `refresh_tokens` token-hash columns, `email_verification_tokens` token-hash, and `leaderboard.session_id`.

These constraints mean that a bug that lets a negative score or a duplicate jti through the application layer is rejected at the database boundary rather than persisted.

---

## Dependency Auditing

CI (`.github/workflows/ci.yml`) runs `pip-audit -r requirements.txt` against backend dependencies and `npm audit --audit-level=high` against frontend dependencies on every push to `main` and every pull request. Dependencies are pinned to specific versions in `requirements.txt` and `package.json`/`package-lock.json`. Three PyJWT/wasmtime advisories are explicitly suppressed in the workflow with inline rationale (`PYSEC-2025-183`, `PYSEC-2024-311`, `PYSEC-2026-151`); each suppression is annotated with the reason it does not apply to this deployment and is expected to be revisited when an actionable fix is published. GitHub Actions versions are pinned by commit SHA, not tag, to defend against tag-mutation supply-chain attacks.

---

## Docker and Deployment

- The backend container runs as a non-root system user (`app`).
- The frontend production container uses `nginxinc/nginx-unprivileged`, which binds to an unprivileged port and does not run as root.
- In the production Docker Compose configuration, the database port is not exposed to the host; only the nginx container has externally bound ports (80 and 443).
- Development Docker Compose binds services to `127.0.0.1` only, not `0.0.0.0`.
- All production services drop every Linux capability (`cap_drop: [ALL]`) and set `security_opt: [no-new-privileges:true]`, so a compromised process cannot regain elevated privileges via setuid binaries.
- Backend and frontend containers run with a read-only root filesystem in production; only explicitly declared `tmpfs` and named-volume mounts are writable.
- The production compose declares a `healthcheck` for every long-running service (`postgres`, `backend`, `frontend`); the periodic `db-backup` service has no healthcheck because it is a one-shot job. The development compose adds healthchecks for `postgres` and `backend` only — the Vite dev server is left without one because reload-driven restarts make the signal noisy.

---

## Known Limitations

The following are areas where this project makes deliberate trade-offs given its scope as an educational game. They are documented here for transparency rather than as claims of future work.

**Inline styles in CSP**: The Content Security Policy includes `unsafe-inline` for styles. Removing this would require a nonce-based approach or elimination of inline styles across the Vue components, which has not been done.

**Password strength is gated only by zxcvbn score ≥ 2**: The application relies on `zxcvbn` to reject weak passwords rather than a hand-maintained dictionary. Score 2 ("somewhat guessable") is the minimum bar, which is enough to block the obvious cases but still admits passwords a motivated attacker with targeted wordlists could break offline. Raising the bar to 3+ would improve safety at the cost of usability and has not been done.

**No password reset flow**: There is no self-service email-based password recovery mechanism. A user who forgets their password cannot recover access without administrator intervention.

**Email verification is implemented but not enforced**: The `/api/auth/verify-email` endpoint, `email_verification_tokens` table, and `is_email_verified` flag are wired up, and verification emails are sent on registration. However, the application does not block unverified users from logging in or playing — the flag is currently informational. Operators who want strict verification must add a gate themselves.

**MFA is optional and not enforced at registration**: TOTP-based MFA is implemented (`totp_secret`, `mfa_enabled`, `totp_last_used_at` columns; step-replay guard active). However, enabling MFA is the user's choice — registration does not require it. Accounts that have not enrolled TOTP rely entirely on password strength and account lockout.

**Rate limiting is per-IP (with proxy awareness)**: Account lockout is per email address, but `slowapi` rate limiting is per client IP. A single user connecting from multiple IPs can exceed per-user expectations, and a shared IP (e.g., a NAT gateway) can trigger rate limits for multiple users. When `PROXY_MODE=true` and `TRUSTED_PROXY_IPS` is configured, the limiter walks `X-Forwarded-For` right-to-left and picks the first hop outside the trusted-proxy set, so a client cannot forge the keyed IP by prepending entries to the header. Outside proxy mode the raw socket IP is used.

**Debug mode exposes API schema**: When `DEBUG=true`, FastAPI serves `/docs` and `/redoc`. In production this should be disabled (it is `false` by default in non-CI environments).

---

## Operator Checklist

Before deploying to a publicly accessible environment:

- [ ] Generate a strong, random `SECRET_KEY` (at least 32 characters of random bytes).
- [ ] Set a strong, random `POSTGRES_PASSWORD` and confirm it is reflected in `DATABASE_URL`.
- [ ] Set a strong, random `POSTGRES_APP_PASSWORD` for the least-privilege application role created by `pg_init_roles.sh`.
- [ ] (Optional, recommended) Set `DATABASE_URL_APP` to the `mathdefense_app` role so runtime queries run with DML-only privileges; leave it unset to run runtime through the admin `DATABASE_URL`.
- [ ] Generate `TOTP_ENCRYPTION_KEY` with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`; back it up — losing it makes every enrolled TOTP secret unrecoverable.
- [ ] If deploying behind nginx (the default production topology), set `PROXY_MODE=true` and populate `TRUSTED_PROXY_IPS` with the proxy's IP or CIDR so per-IP rate limits key on the real client address.
- [ ] Set `CORS_ORIGINS` to only the origins your frontend is served from, and keep `CORS_ORIGIN_1` / `CORS_ORIGIN_2` (consumed by nginx via `envsubst`) in sync.
- [ ] Confirm `COOKIE_SECURE=true` (the default) is not overridden.
- [ ] Confirm `CSRF_ENABLED=true` (the default) is not overridden.
- [ ] Deploy behind the provided nginx TLS configuration and obtain a valid TLS certificate.
- [ ] Ensure nginx is the only publicly reachable entry point; the backend should not be exposed directly to the internet.
- [ ] Ensure the `.env` file is excluded from version control and has restrictive file permissions.
- [ ] Confirm `DEBUG=false` (the default in non-CI environments).
- [ ] Run `pip-audit` and `npm audit` and address any high-severity findings before going live.
