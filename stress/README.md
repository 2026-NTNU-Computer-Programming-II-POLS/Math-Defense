# Stress and load tests

This directory holds the load and throughput tests for Math Defense. They exist
to answer two distinct questions, so they use two distinct tools:

1. **Can the backend serve a realistic crowd of players without errors or
   unacceptable latency?** Answered by HTTP load tests written in
   [k6](https://k6.io), under `k6/`. These exercise the whole service path:
   network, FastAPI, SQLAlchemy, PostgreSQL, and the CPU-bound bcrypt password
   hashing.

2. **How fast is the pure computation the game depends on?** Answered by Node
   micro-benchmarks run through the frontend's existing `npm run bench` harness
   (`frontend/dev/*.bench.ts`). These measure the WASM math engine, the V2 score
   formula, and the per-frame combat loop - code that never crosses the network
   and therefore cannot be reached by k6.

Keep the two separate in your head: k6 tells you about the *deployed service*;
the benches tell you about *computation*. A regression in one says nothing about
the other.

The measured numbers from the most recent runs live in
[`RESULTS.md`](RESULTS.md) (auto-maintained, latest two runs). This file
explains what the tests mean and how to run them; it deliberately does not
hard-code result numbers, which go stale.


## Quick start

Run everything with one command. Double-click `stress\run-stress.cmd` in
Explorer, or from a terminal:

```
stress\run-stress.cmd            full run (real ramping profiles, ~20 min)
stress\run-stress.cmd -Quick     smoke run (~3 min; for validating the script)
stress\run-stress.cmd -TearDown  wipe the throwaway database when finished
```

`run-stress.cmd` is a thin launcher (it bypasses the PowerShell execution policy
and keeps the console open) around `run-stress.ps1`, which:

- locates k6 on PATH, repairs the PATH if k6 is installed but not visible, and
  installs it via winget if it is missing entirely;
- brings the stack up (`docker compose ... up -d`) and waits for the backend
  health check;
- seeds the account pool;
- runs every k6 scenario and then the compute benches, in order;
- writes a dated summary to `RESULTS.md` and the full per-test logs to
  `stress/results/<timestamp>/`.

Flags: `-Quick`, `-Build` (rebuild the image after backend code changes),
`-TearDown`, `-SkipBench`. The default is a full run.

If you prefer to drive it yourself, see "Running tests manually" below.


## What each test represents and how to read it

This is the important part: each test stands for a concrete real-world
situation. Knowing which one it is tells you what a green or red result
actually means.

### HTTP scenarios (k6, under `k6/`)

| Script | Real-world situation | What it stresses | What a result tells you |
|---|---|---|---|
| `seed-users.js` | One-time setup. | Registration path. | Run it first; it creates `stress_user_0..N@stress.invalid`. Not a measurement. |
| `01-read-heavy.js` | A class browsing leaderboards and profiles between games. | The read path: indexed `SELECT`s, the connection pool, JSON serialization. | The cheapest, highest-throughput path. If this is slow, the database or pool is the problem, not application logic. |
| `02-auth-flow.js` | Account churn: register, log in, refresh, log out. | bcrypt password hashing, which is intentionally CPU-expensive, plus refresh-token rotation and token-denylist writes. | The first subsystem to saturate the CPU. Rising login latency here is the clearest early-warning signal of an overloaded box. |
| `03-session-lifecycle.js` | Players actively in a game: start, sync each wave, finish. | The write path: `INSERT`/`UPDATE` under row locks, plus the server-side score recomputation on `end`. | How well the database handles concurrent writes. Usually the most comfortable path in this app. |
| `04-peak-100.js` | The busy moment: roughly 100 students all playing at once. | Everything together - a mixed workload, not a single endpoint. | The holistic answer to "does it hold under a realistic peak". When this shows strain, re-run 01/02/03 to localise which subsystem gave way. |
| `05-login-spike.js` | The bell rings and a whole class hits "log in" within seconds. | bcrypt under a concentrated burst - the one thing `04` deliberately spreads out (in `04` each player logs in once, and arrivals are ramped over a minute). | Whether a synchronized login rush stalls the server. A 429 here is the per-email throttle defending as designed (counted separately, not treated as a failure); a 5xx is a real problem. |

The relationship between them: `01`, `02`, `03`, and `05` are focused,
single-concern diagnostics. `04-peak-100.js` is the integrated load test. Use
the focused scripts to isolate a problem that the peak test surfaces.

`04` and `05` are described in more detail below.

### Compute benchmarks (Vitest, under `frontend/dev/`)

| Bench | What it measures | Why it matters |
|---|---|---|
| `bench-wasm-engine` | Throughput (ops/sec, ns/op) of each hot WASM export: matrix multiply, numerical integration, sector coverage, curve evaluation, the PRNG, and the full `calculateScore` breakdown. | This computation runs both in the browser per frame and server-side on every replay verification. A regression in the C build or the JS marshalling shows up here as a number. |
| `bench-game-hotpath` | Per-frame wall time of the engine's `O(towers x enemies)` combat/movement inner loop, at growing entity counts, against the 60 FPS budget (16.67 ms/frame). | Tells you at what entity count the engine would start dropping frames. It is a faithful proxy for the hot path, not the full engine (no rendering or event dispatch - those require a DOM). |


## How the test environment works

The backend is built to be hard to attack, which also makes it hard to load-test
honestly. The stress environment relaxes those defenses only in ways the
application itself sanctions, so production behaviour is never weakened.

**CSRF and secure cookies.** State-changing requests normally require a matching
`X-CSRF-Token` header, and auth cookies are `Secure` (HTTPS-only). The config
validators in `backend/app/config.py` permit `CSRF_ENABLED=false` and
`COOKIE_SECURE=false` only when `CI=true`. The stress compose sets `CI=true`;
this is the sanctioned escape hatch, not a code change. Outside the test/CI
harness these flags are rejected, so production still fails closed.

**Rate limiting.** slowapi limits requests per client IP. From a single load
generator every virtual user would share one IP and the whole run would be
throttled. The environment sets `PROXY_MODE=true` with a `TRUSTED_PROXY_IPS`
covering the Docker subnet, so the backend trusts `X-Forwarded-For`; each k6 VU
sends a unique synthetic IP (`k6/lib/config.js`) and therefore gets its own
rate-limit bucket. This mirrors distributed real traffic instead of collapsing
into one client's quota. See "Rate limit modes" below for turning limits fully
off versus exercising them.

**Cookie handling.** k6 resets its cookie jar between iterations, so a naive
"log in once and reuse the cookie" loop would lose authentication after the
first iteration. `k6/lib/auth.js::establishSession` logs in once, captures the
issued cookie values into a VU-scoped variable, and re-injects them each
iteration - so the read and session scripts do not pay the bcrypt cost on every
loop.

**Process model.** A one-shot `migrate` service runs `alembic upgrade head`,
then the `backend` service serves via gunicorn with `STRESS_WORKERS`
UvicornWorker processes. Running migrations once up front avoids having every
worker race on the migration advisory lock at boot.

The stack runs on ports 8001 (backend) and 5433 (Postgres) so it never collides
with the development stack (8000 / 5432 / 5173).


## Running tests manually

If you would rather not use the launcher:

```
cd stress
cp .env.stress.example .env.stress
#   then edit .env.stress: generate SECRET_KEY and TOTP_ENCRYPTION_KEY (the
#   commands are in the file). The "changeme" database password is fine here
#   because CI=true relaxes that validator.

# bring up the migrate step + backend + postgres
docker compose -f docker-compose.stress.yml --env-file .env.stress up -d --build

# seed the account pool once
docker compose -f docker-compose.stress.yml --env-file .env.stress run --rm k6 run /scripts/seed-users.js

# run any scenario (this uses the bundled, co-located k6 container)
docker compose -f docker-compose.stress.yml --env-file .env.stress run --rm k6 run /scripts/01-read-heavy.js

# tear down and wipe the throwaway database
docker compose -f docker-compose.stress.yml --env-file .env.stress down -v
```

To run k6 from the host instead of the bundled container (better isolation; see
limitation 1 below), install k6 and point it at the published port. The backend
still trusts the synthetic `X-Forwarded-For` because the request arrives through
Docker's gateway, which is inside `TRUSTED_PROXY_IPS`:

```
k6 run -e BASE_URL=http://localhost:8001 -e USER_COUNT=200 stress\k6\01-read-heavy.js
```

### The peak scenario (`04-peak-100.js`) in detail

One VU is one player who logs in once, then loops full play-throughs:
active-session check, create, three wave-sync PATCHes, end, leaderboard read,
and an occasional `/me`. The profile ramps from 0 to 100 VUs over 60 seconds
(spreading the login burst), holds 100 for 7 minutes, briefly overshoots to 130
to probe headroom, then drains. Tuning knobs: `THINK` (seconds between games,
default 0.7 - lower is harsher) and `PATCH_GAP` (seconds between wave syncs,
default 0.35).

### The login-spike scenario (`05-login-spike.js`) in detail

A `shared-iterations` burst: `SPIKE_LOGINS` distinct logins drained by
`SPIKE_VUS` virtual users as fast as possible. Each login uses a distinct pool
account so the per-email throttle does not fire and we measure raw bcrypt under
concurrency. Knobs: `SPIKE_VUS` (burst width, default 150) and `SPIKE_LOGINS`
(total, default = `USER_COUNT`). If `SPIKE_LOGINS` exceeds the pool size the
indices wrap and some logins will legitimately receive 429 from the per-email
throttle; those are counted, not treated as server failures.

### Rate limit modes

- **Off (the default for this environment).** The compose sets
  `RATELIMIT_ENABLED=false`, which `backend/app/limiter.py` honours only because
  `CI=true`. Outside the test/CI harness the flag is logged and ignored, so
  production rate limiting stays unconditional. This gives a clean raw-capacity
  measurement.
- **On (more realistic).** Set `RATELIMIT_ENABLED=true` in `.env.stress`. The
  per-IP limits then apply, but the per-VU synthetic IP gives each VU its own
  bucket, so you model many distinct clients rather than one throttled client.

In both modes the per-email login throttle (10/min) and account lockout (5
failures) remain active; the scripts avoid them by using one pool account per VU
(read and session scripts) or a fresh email per iteration (auth churn).

### Quick smoke versus full run

By default each k6 scenario uses its realistic ramping profile. Setting `VUS`
and/or `DURATION` switches a scenario to a flat constant-VU smoke profile for a
fast sanity check:

```
k6 run -e BASE_URL=http://localhost:8001 -e DURATION=20s -e VUS=10 stress\k6\01-read-heavy.js
```

The launcher's `-Quick` flag applies this to every scenario at once.

### Compute benches

```
cd frontend
npm run prebuild   # builds wasm/ into src/math/wasm/math_engine.wasm (needs emcc); skip if the artifact already exists
npm run bench      # runs every dev/**/*.bench.ts
```

These are PR-attached numbers, not CI gates - they are too sensitive to the host
machine to gate merges on. On PowerShell, if `npm run bench` is blocked by the
execution policy, run `cmd /c "npm run bench"` instead.


## Where results go and how to read them

- `RESULTS.md` holds the two most recent runs as Markdown tables, written by the
  launcher inside a `<!-- STRESS-RESULTS:START/END -->` block. Do not hand-edit
  it; the next run rewrites the block.
- `stress/results/<timestamp>/` holds the full, untouched k6 and bench output
  for every run (this directory is gitignored).

Reading a k6 result:

- `http_req_failed` is the error rate. Anything above roughly 0 under these
  profiles means the server returned 4xx/5xx or timed out.
- `checks` is the share of assertions that passed (correct status codes, etc.).
- p95 latency is the 95th-percentile response time. Each script encodes p95 and
  error-rate thresholds, so k6 exits non-zero when a service-level objective is
  breached; the launcher records that as a PASS/FAIL per scenario.


## Known limitations: what these tests do NOT tell you

Read these before drawing conclusions. They are ordered by how likely they are
to mislead you.

1. **Co-located load generator inflates latency.** When k6, the backend, and
   Postgres share one machine (the bundled `k6` compose service, or host k6 on
   the same box), they contend for the same CPU. Latency numbers from such a run
   are a pessimistic floor, not the application's real capacity. Trust the error
   rate and "did it stay up" from a co-located run; trust the latency numbers
   only when the load generator runs on separate hardware.

2. **The breaking point has not been found.** The peak scenario holds at 100 and
   even at the 130-VU overshoot with zero errors and latency well under its
   thresholds, which means the real ceiling is higher and untested. There is
   currently no ramp-to-failure scenario, so these tests confirm "comfortably
   handles a realistic peak" but cannot answer "exactly how many concurrent
   users before it falls over".

3. **Short duration misses slow failures.** The default profiles run for minutes.
   Connection-pool exhaustion, memory leaks, file-descriptor leaks, and
   background-task drift typically appear only over hours of sustained load. A
   green multi-minute run does not certify multi-hour stability.

4. **The database is small and synthetic.** Each run starts from an empty schema
   and accumulates only its own data. Query plans, index behaviour, and
   leaderboard ranking costs differ on a production-sized dataset (hundreds of
   thousands of sessions). These tests do not model that.

5. **Gameplay data is bounded to level 1.** Sessions use `star_rating=1`, whose
   anti-cheat caps are 3 waves, 50 kills, and 5000 score
   (`backend/app/domain/constraints.py`). Other levels, challenge modes, talent
   trees, territory settlement, and most game mechanics are not exercised.

6. **Worker count has limited effect on this app.** FastAPI runs synchronous
   endpoints in a threadpool and bcrypt releases the GIL, so a single process
   already parallelizes password hashing across cores. Capacity is bounded by
   `cores x bcrypt cost`, not by gunicorn worker count. To raise authentication
   capacity, add cores or lower the bcrypt cost factor - adding workers alone
   does little.

7. **Rate limiting is off by default here.** The headline numbers are raw
   capacity with `RATELIMIT_ENABLED=false`. Real production traffic is also
   shaped by the per-IP limits, the per-email login throttle, and account
   lockout. Set `RATELIMIT_ENABLED=true` to measure with them on.

8. **The benches are isolated, not the live engine.** `bench-wasm-engine`
   measures functions in a tight loop with no surrounding work. `bench-game-hotpath`
   reconstructs the combat/movement math but omits rendering, the event bus, and
   the garbage-collection pressure of the real running game. They are accurate
   for the computation they cover and should be read as lower bounds on cost.

9. **Numbers are machine-specific.** Absolute throughput and latency depend
   heavily on the host. Compare runs on the same hardware (trend over time), not
   absolute figures across different machines.


## Implementation notes and bring-up findings

Facts uncovered while making the suite pass end to end. Some are fixes already
applied; all are worth knowing.

1. **The alembic chain was not replayable from an empty database (now fixed).**
   A fresh `alembic upgrade head` used to fail at revision `58cbdc857a81` with
   `DuplicateTable: relation "removed_class_memberships" already exists`. That
   migration recreated three tables an ancestor (`i3d4e5f6a7b8`) had already
   created. The test suite never caught it because `conftest.py` builds the
   schema with `Base.metadata.create_all`, not migrations - so a brand-new
   deployment would have failed to boot. The fix guards each `CREATE` in that
   revision with an existence check and corrects its `downgrade`. A CI step
   (`Migrations replay from a fresh DB` in `.github/workflows/ci.yml`) now runs
   the real migration chain from zero so this class of bug fails CI in future.

2. **gunicorn, not `uvicorn --workers`, for multiple processes.** While the
   migration above was still broken, every `--workers` child hit the
   DuplicateTable and died in a boot loop. The current setup migrates once in the
   `migrate` step, then serves with gunicorn UvicornWorkers.

3. **`end_session` already writes the leaderboard row.** A follow-up
   `POST /api/leaderboard` returns 409 ("Score already submitted"), so the
   session-lifecycle script ends at `end` and does not submit separately.

4. **Authentication does not require a verified email.** Registered pool users
   can log in immediately, which is why the suite can seed and use its own
   accounts without an email round-trip.
