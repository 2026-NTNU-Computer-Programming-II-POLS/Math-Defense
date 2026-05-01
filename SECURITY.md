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

### Tokens and Cookies

Authentication uses short-lived JWT tokens (30-minute expiry by default, configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`). Tokens are delivered as `HttpOnly`, `SameSite=Lax` cookies. The `Secure` flag is enforced at startup: attempting to disable it outside of the CI/test harness causes the application to refuse to start.

Tokens carry the following claims, all of which are validated at decode time:

| Claim | Purpose |
|---|---|
| `sub` | User ID |
| `iss` / `aud` | Issuer and audience binding (prevents cross-service token reuse) |
| `jti` | Unique token ID used for revocation |
| `exp` / `iat` | Expiry and issued-at timestamps |
| `pv` | Password version; incremented on password change to invalidate old tokens |

The signing algorithm is pinned to `HS256` in the decode call; the library's default of accepting any algorithm advertised in the token header is explicitly overridden.

### Token Revocation

On logout, the token's `jti` is inserted into a persistent PostgreSQL deny-list table with its expiry timestamp. Expired entries are pruned on insertion so the table does not grow unboundedly. This means revocation survives application restarts.

Password changes increment the user's `password_version` field. Any token whose `pv` claim does not match the current value is rejected at the dependency level before reaching route handlers.

### Account Lockout

After five consecutive failed login attempts within a five-minute window, the account is locked for five minutes. The lockout state is stored in the database and updated with a PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` statement to avoid race conditions under concurrent login attempts. A dummy bcrypt comparison is performed for usernames that do not exist, so response timing does not reveal whether an account exists.

### Password Hashing

Passwords are hashed with bcrypt at a cost factor of 12. Input is truncated to 72 bytes before hashing to avoid a bcrypt-specific issue where bytes beyond the 72-byte limit are silently ignored.

---

## Input Validation

All request bodies are parsed through Pydantic v2 models with `extra="forbid"`, meaning unknown fields are rejected with HTTP 422 rather than silently discarded.

Key field-level validations:

- **Password**: minimum 8 characters, maximum 72 bytes, must contain at least one letter and one digit, rejects patterns with five or more repeated characters, and rejects a small list of common passwords.
- **Email**: validated against a standard email pattern, normalized to lowercase, and checked for uniqueness at registration.
- **Player name**: trimmed of whitespace, 1–50 characters.
- **Avatar URL**: validated against a strict whitelist of six known paths; arbitrary URLs are rejected.

These validations are applied at the schema boundary, not only in the database layer.

---

## SQL Injection

The application uses SQLAlchemy's ORM for all database interactions. No raw SQL strings were observed in the codebase. Parameterized queries are used throughout, including the PostgreSQL-specific `INSERT ... ON CONFLICT` statements in the login guard and token deny-list.

---

## CSRF Protection

The application implements the double-submit cookie pattern for CSRF protection. A random token is set in a `csrf-token` cookie and must also appear in the `X-CSRF-Token` request header on all state-mutating requests. The token is refreshed on every response.

CSRF protection is enabled by default. Attempting to disable it outside of the CI/test harness causes the application to refuse to start. `SameSite=Lax` cookies provide a second layer of defence for modern browsers, but the explicit CSRF check is retained because `SameSite` alone does not cover all older browsers or all cross-origin navigation patterns.

---

## CORS

Allowed origins are read from the `CORS_ORIGINS` environment variable (comma-separated). The application validates that each entry begins with `http://` or `https://` and contains a non-empty hostname. An empty list causes the application to refuse to start.

`Access-Control-Allow-Credentials: true` is set, so origins must be an explicit list rather than a wildcard. The allowed headers are limited to `Authorization`, `Content-Type`, and `X-CSRF-Token`.

---

## Rate Limiting

The following per-IP rate limits are enforced via `slowapi`:

| Endpoint | Limit |
|---|---|
| `POST /register` | 5 requests/minute |
| `POST /login` | 10 requests/minute |
| `POST /logout` | 30 requests/minute |
| `POST /change-password` | 5 requests/minute |
| `GET /me` | 30 requests/minute |
| `PATCH /profile/avatar` | 10 requests/minute |

When running behind a reverse proxy, set `PROXY_MODE=true` and `TRUSTED_PROXY_IPS` to a comma-separated list of trusted proxy IP addresses. If `PROXY_MODE=true` is set without `TRUSTED_PROXY_IPS`, the application logs a warning and falls back to the raw socket IP, which may not correctly identify client IPs behind load balancers.

---

## HTTP Security Headers

nginx applies the following security headers to all responses in the production configuration:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Disables camera, microphone, geolocation, and payment |
| `Content-Security-Policy` | Restricts script and object sources; inline styles use `unsafe-inline` (see Known Limitations) |

---

## Secret Management

The following values must be set via environment variables or an `.env` file and are validated at startup:

| Variable | Requirement |
|---|---|
| `SECRET_KEY` | Minimum 16 characters; used to sign JWTs |
| `DATABASE_URL` | Must use the `postgresql+psycopg` scheme; the application rejects URLs containing the literal password `changeme` in non-test environments |
| `CORS_ORIGINS` | One or more valid HTTP/HTTPS origins |
| `POSTGRES_PASSWORD` | Used by Docker Compose; should be a strong random value |

The application logs which source supplied `SECRET_KEY` (environment variable or `.env` file) at startup so that operators can confirm the correct secret was loaded. Changing the secret key invalidates all issued JWTs immediately.

**Important for operators**: The `.env` file must not be committed to version control. The repository provides a `.env.example` template with placeholder values. If real credentials have ever been committed to your repository's history, they should be treated as compromised and rotated, and the history should be cleaned with a tool such as `git-filter-repo`.

---

## Dependency Auditing

CI runs `pip-audit` against backend dependencies and `npm audit --audit-level=high` against frontend dependencies on every pull request. Dependencies are pinned to specific versions in `requirements.txt` and `package.json`.

---

## Docker and Deployment

- The backend container runs as a non-root system user (`app`).
- The frontend production container uses `nginxinc/nginx-unprivileged`, which binds to an unprivileged port and does not run as root.
- In the production Docker Compose configuration, the database port is not exposed to the host; only the nginx container has externally bound ports (80 and 443).
- Development Docker Compose binds services to `127.0.0.1` only, not `0.0.0.0`.

---

## Known Limitations

The following are areas where this project makes deliberate trade-offs given its scope as an educational game. They are documented here for transparency rather than as claims of future work.

**Inline styles in CSP**: The Content Security Policy includes `unsafe-inline` for styles. Removing this would require a nonce-based approach or elimination of inline styles across the Vue components, which has not been done.

**Password dictionary size**: The common-password blocklist contains a small number of well-known weak passwords. It is not a comprehensive dictionary. A determined user can still choose a weak but technically valid password.

**No password reset flow**: There is no email-based password recovery mechanism. A user who forgets their password cannot recover access without administrator intervention.

**No email verification**: Registration does not verify email ownership. Any email address that passes format validation can be used to create an account.

**No multi-factor authentication**: MFA is not implemented. For an educational game this is a reasonable trade-off, but it means account security relies entirely on password strength and account lockout.

**No persistent audit log**: Sensitive events such as login, logout, and password changes are written to application logs but not stored in the database as a structured audit trail.

**Rate limiting is per-IP**: Account lockout is per email address, but rate limiting is per client IP. A single user connecting from multiple IPs can exceed per-user expectations, and a shared IP (e.g., a NAT gateway) can trigger rate limits for multiple users.

**Debug mode exposes API schema**: When `DEBUG=true`, FastAPI serves `/docs` and `/redoc`. In production this should be disabled (it is `false` by default in non-CI environments).

---

## Operator Checklist

Before deploying to a publicly accessible environment:

- [ ] Generate a strong, random `SECRET_KEY` (at least 32 characters of random bytes).
- [ ] Set a strong, random `POSTGRES_PASSWORD` and confirm it is reflected in `DATABASE_URL`.
- [ ] Set `CORS_ORIGINS` to only the origins your frontend is served from.
- [ ] Confirm `COOKIE_SECURE=true` (the default) is not overridden.
- [ ] Confirm `CSRF_ENABLED=true` (the default) is not overridden.
- [ ] Deploy behind the provided nginx TLS configuration and obtain a valid TLS certificate.
- [ ] If using a reverse proxy or load balancer, set `PROXY_MODE=true` and `TRUSTED_PROXY_IPS`.
- [ ] Ensure the `.env` file is excluded from version control and has restrictive file permissions.
- [ ] Confirm `DEBUG=false` (the default in non-CI environments).
- [ ] Run `pip-audit` and `npm audit` and address any high-severity findings before going live.
