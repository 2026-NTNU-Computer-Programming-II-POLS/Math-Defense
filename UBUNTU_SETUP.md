# Running Math Defense on Ubuntu 24.04 LTS

A step-by-step setup guide for **Ubuntu 24.04 LTS (Noble Numbat)**. It covers
two independent ways to bring the stack up:

- **[Path A — Docker](#path-a--docker-recommended)** — install Docker, fill in
  `.env`, run one command. Everything else (Node, Python, PostgreSQL, the
  Emscripten WASM build) is supplied by container images. **Recommended** —
  it sidesteps every version-mismatch issue below.
- **[Path B — Native install](#path-b--native-install)** — run the backend and
  frontend directly on the host. More moving parts, but no Docker.

> **Why this guide exists.** The project targets bleeding-edge runtimes
> (**Node.js 26+**, **Python 3.13+**). Ubuntu 24.04 ships **Node 18** and
> **Python 3.12** in its default `apt` repositories, so a naive
> `apt install nodejs python3` is *not* sufficient for the native path. PostgreSQL
> 16 — the version this project uses — *is* available from `apt`. This guide spells
> out exactly what to add.

---

## TL;DR

```bash
# ---- Path A: Docker (recommended) ----
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker "$USER" && newgrp docker   # run docker without sudo
git clone <repo-url> Math-Defense && cd Math-Defense
cp .env.example .env
# edit .env — fill SECRET_KEY, DATABASE_URL, POSTGRES_PASSWORD, TOTP_ENCRYPTION_KEY (see below)
docker compose up
# → frontend http://localhost:5173 · backend http://localhost:8000
```

---

## Prerequisites at a glance

| Component | Project needs | Ubuntu 24.04 `apt` default | Action for native path |
|---|---|---|---|
| Node.js | **26+** | 18.19 | Install via NodeSource **or** nvm |
| Python | **3.13+** | 3.12.3 | Install via deadsnakes PPA **or** pyenv |
| PostgreSQL | **16** | 16 ✅ | `apt install postgresql-16` |
| Emscripten | only to **rebuild** WASM | — | Not needed to run; see [WASM note](#about-the-wasm-engine) |
| `make` + C toolchain | only to rebuild WASM | — | `apt install build-essential` (only if rebuilding) |

The repository already commits the compiled WASM artifacts
(`frontend/src/math/wasm/math_engine.{js,wasm,d.ts}`), and the math layer has a
pure-TypeScript fallback, so **you do not need Emscripten to play the game** in
dev mode.

---

## Path A — Docker (recommended)

### A.1 Install Docker Engine + Compose v2

The quickest route uses Ubuntu's own packages:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
```

`docker-compose-v2` provides the `docker compose` (space, not hyphen)
subcommand this project's files target.

> Prefer Docker's official upstream repository (newer engine, `docker-ce`)? Follow
> <https://docs.docker.com/engine/install/ubuntu/> instead — both work. The
> compose files use the version-less `services:` schema, which requires Compose
> **v2** (any recent build is fine).

Let your user run Docker without `sudo`:

```bash
sudo usermod -aG docker "$USER"
newgrp docker            # applies the new group to the current shell
docker run --rm hello-world   # sanity check
```

### A.2 Get the code

```bash
git clone <repo-url> Math-Defense
cd Math-Defense
```

> No Emscripten SDK ships with the repo (`emsdk/` is gitignored) and none is
> needed here — `backend/Dockerfile` pulls `emscripten/emsdk:5.0.7` from Docker
> Hub to rebuild the WASM, and the frontend image uses the committed binary.

### A.3 Create and fill `.env`

```bash
cp .env.example .env
```

Open `.env` and set every **required** variable. The backend **refuses to boot**
if any is missing or left at its placeholder. Generate strong values with:

```bash
# SECRET_KEY — JWT signing secret (≥32 chars)
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# TOTP_ENCRYPTION_KEY — Fernet key for encrypting TOTP secrets at rest
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# If 'cryptography' is missing on the host: pip3 install --user cryptography
```

Minimum required edits in `.env`:

| Variable | What to set |
|---|---|
| `SECRET_KEY` | Output of the `token_urlsafe(48)` command above |
| `DATABASE_URL` | Replace the literal `changeme` password. Keep host `postgres` (the compose service name). e.g. `postgresql+psycopg://mathdefense:<pw>@postgres:5432/math_defense` |
| `POSTGRES_PASSWORD` | The **same** `<pw>` you embedded in `DATABASE_URL` |
| `TOTP_ENCRYPTION_KEY` | Output of the Fernet command above |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` (default is fine for local dev) |
| `FRONTEND_URL` | `http://localhost:5173` (default is fine for local dev) |

> The backend has an explicit guard that aborts startup while
> `DATABASE_URL` still contains the literal `changeme` — so a forgotten
> placeholder fails loudly instead of booting insecurely.

Optional but handy for a first run — seed demo accounts:

```ini
SEED_DEMO_USER=true
```

This creates `teacher@mathdefense.local / TeacherDev2026!`,
`student@mathdefense.local / StudentDev2026!`, and
`admin@mathdefense.local / AdminDev2026!`, which also appear as click-to-fill
buttons on the login page. A localhost guard keeps this a no-op in production.

### A.4 Bring it up

```bash
docker compose up            # add -d to detach
```

Compose starts three services in order (Postgres → backend → frontend), waits on
health checks, and runs the Alembic migrations automatically from the backend's
startup lifespan.

| Service | URL |
|---|---|
| Frontend (Vite dev server) | <http://localhost:5173> |
| Backend API | <http://localhost:8000> |
| API health probe | <http://localhost:8000/health> |
| OpenAPI docs | <http://localhost:8000/docs> *(only when `DEBUG=true`)* |

All three ports are bound to `127.0.0.1` only — not exposed to your LAN.

> **`/docs` is off by default.** `.env.example` does not set `DEBUG`, so the
> backend boots with `DEBUG=false` and `/docs`, `/redoc` and `/openapi.json` all
> return 404. Add `DEBUG=true` to `.env` and restart the backend to enable them
> (dev only — production must never expose the schema).

> **On a remote / headless Ubuntu box?** The ports bind to `127.0.0.1`, and auth
> cookies are issued `Secure` with CSRF on by default, so opening
> `http://<server-lan-ip>:5173` from another machine **fails to log in silently**
> — the browser drops the `Secure` cookie over plain HTTP to a non-localhost
> host. Forward the port over SSH so the browser still sees `localhost`:
> `ssh -L 5173:localhost:5173 you@server`, then browse <http://localhost:5173>.
> Vite proxies `/api` to the backend inside the box, so only 5173 needs forwarding.

Stop with `Ctrl-C` (or `docker compose down` if detached). Add `-v` to also drop
the Postgres volume and start from an empty database next time.

### A.5 Common Docker issues

| Symptom | Cause / fix |
|---|---|
| `permission denied … /var/run/docker.sock` | You skipped the `usermod -aG docker` step or did not re-login. Run `newgrp docker` or log out/in. |
| Backend exits immediately, logs mention `changeme` / missing key | A required `.env` value is unset or still a placeholder. Re-check §A.3. |
| `docker compose: command not found` | `docker-compose-v2` not installed, or you typed the old hyphenated `docker-compose`. |
| Port 5432/8000/5173 already in use | A native Postgres / another dev server is bound. Stop it, or edit the `ports:` mappings in `docker-compose.yml`. |
| Frontend loads but every `/api` call 502s | Backend not healthy yet — wait for its health check, or check `docker compose logs backend`. |

---

## Path B — Native install

Use this if you would rather not run Docker. You will install three runtimes
plus a PostgreSQL database on the host.

### B.1 Node.js 26+

Ubuntu's `apt` ships Node 18, which is too old. Pick **one** of:

**Option 1 — NodeSource (system-wide):**

```bash
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # expect v26.x
```

**Option 2 — nvm (per-user, easiest for bleeding-edge):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# restart the shell, then:
nvm install 26
nvm use 26
node --version
```

### B.2 Python 3.13+

Ubuntu 24.04 ships Python 3.12. Add 3.13 via the deadsnakes PPA:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.13 python3.13-venv python3.13-dev
python3.13 --version    # expect 3.13.x
```

> Alternative: [pyenv](https://github.com/pyenv/pyenv) (`pyenv install 3.13`)
> if you prefer not to add a PPA. Build deps for pyenv:
> `sudo apt install -y build-essential libssl-dev zlib1g-dev libbz2-dev
> libreadline-dev libsqlite3-dev libffi-dev liblzma-dev`.

### B.3 PostgreSQL 16

This one is in the default repos:

```bash
sudo apt install -y postgresql-16
sudo systemctl enable --now postgresql
```

Create the database role and database the app expects. Pick a password and use
it consistently:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE mathdefense WITH LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE math_defense OWNER mathdefense;
SQL
```

The backend's pytest suite auto-creates a `math_defense_test` database from the
same connection, so the `mathdefense` role needs `CREATEDB` if you intend to run
the tests:

```bash
sudo -u postgres psql -c "ALTER ROLE mathdefense CREATEDB;"
```

> **Least-privilege runtime role (optional).** `scripts/pg_init_roles.sh`
> creates a DML-only `mathdefense_app` role for production. It runs
> automatically as a Postgres init hook under Docker; for a native install run
> its SQL manually as the superuser only if you plan to set `DATABASE_URL_APP`.
> For a plain dev setup you can skip it.

### B.4 Backend

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt      # use requirements.txt for prod-only deps

cp ../.env.example .env                   # uvicorn reads env_file=".env" from backend/ cwd
```

Edit `backend/.env`:

- Change the `DATABASE_URL` **host** from `postgres` to `localhost` (you are not
  on the Docker network now):
  `postgresql+psycopg://mathdefense:<your-pw>@localhost:5432/math_defense`
- Set `SECRET_KEY` and `TOTP_ENCRYPTION_KEY` (generation commands in §A.3).
- Keep `CORS_ORIGINS` / `FRONTEND_URL` at their localhost defaults.

Run it (migrations apply automatically on first boot via the FastAPI lifespan):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> All Python dependencies install from prebuilt wheels — `psycopg[binary]`,
> `bcrypt`, and `wasmtime` are binary wheels, so **no C compiler is needed** for
> the backend. (`build-essential` is only relevant if you build Python itself
> with pyenv, or rebuild the WASM engine.)

### B.5 Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:8000`, so the browser sees no CORS.
Open <http://localhost:5173>.

> `npm run dev` does **not** compile WASM — it uses the committed binary. Only
> `npm run build` (production bundling) triggers the WASM rebuild via the
> `prebuild` hook; see the next section before running it on Linux.

---

## About the WASM engine

The C math engine (`wasm/`) is compiled to WebAssembly with Emscripten. **You
almost never need to build it yourself** because:

- The compiled artifacts are committed under `frontend/src/math/wasm/`.
- `WasmBridge.ts` has a pure-TypeScript fallback for every function.
- The Docker backend image rebuilds it from `emscripten/emsdk:5.0.7` on Docker
  Hub; the Docker frontend image uses the committed binary.

### ⚠️ No Emscripten SDK ships with the repo

`emsdk/` is **gitignored** — a fresh clone contains no Emscripten toolchain at
all (some Windows dev machines keep a local Windows build at that path; it
would not run on Ubuntu anyway). To rebuild on Linux, use one of the two
options below, and install the same **5.0.7** that `backend/Dockerfile` and CI
pin so the produced binary matches bit-for-bit.

### Rebuilding WASM on Ubuntu (only if you changed `wasm/*.c`)

Two clean options:

**Option 1 — let Docker do it (no host Emscripten):**

```bash
# Rebuilds the backend image, which compiles the WASM in its first stage.
docker compose build backend
```

**Option 2 — install a fresh Linux Emscripten SDK:**

```bash
sudo apt install -y build-essential   # provides make + a C toolchain
cd /tmp
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install 5.0.7
./emsdk activate 5.0.7
source ./emsdk_env.sh                 # puts emcc on PATH for this shell

cd /path/to/Math-Defense/wasm
make                                  # writes into frontend/src/math/wasm/
```

> **Heads-up for `npm run build`:** the frontend's `prebuild` hook runs
> `cd ../wasm && make`, so a production build **requires `emcc` on PATH**. If you
> only want the static bundle and have not changed the C sources, you can mirror
> the Docker build's approach and invoke the compiler steps directly, skipping
> the hook: `npx vue-tsc -b && npx vite build`.

---

## Running the tests

**Backend** (needs the PostgreSQL instance from §B.3 reachable; auto-creates
`math_defense_test`):

```bash
cd backend
source .venv/bin/activate
pytest
```

**Frontend** (Vitest + happy-dom, no DB needed):

```bash
cd frontend
npm test
```

---

## Production build (native)

The prod compose builds self-contained images and fronts them with nginx over
**TLS** using `nginx-tls.conf` (HTTP :80 → HTTPS :443), which serves the Vite
`dist/` bundle and reverse-proxies `/api/`. It also adds a nightly `db-backup`
service — four services in total versus dev's three.

**1. Provision TLS certificates first.** The frontend container bind-mounts
`./certs`, and `nginx-tls.conf` **refuses to start if `fullchain.pem` or
`privkey.pem` is missing** — so create them *before* bringing the stack up
(the directory is gitignored and absent on a fresh clone). For a real
deployment use your CA / Let's Encrypt files; for a local prod smoke-test a
self-signed pair is enough:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
  -keyout certs/privkey.pem -out certs/fullchain.pem \
  -subj "/CN=localhost"
```

**2. Set the production `.env` values** — real `SECRET_KEY`, strong DB password,
`CORS_ORIGINS`/`FRONTEND_URL` pointing at your domain, and `COOKIE_SECURE=true`
(safe now that the frontend serves HTTPS). Keep `CORS_ORIGIN_1`/`CORS_ORIGIN_2`
in sync with `CORS_ORIGINS` — nginx and FastAPI read separate variables (see the
note in `.env.example`).

**3. Bring it up:**

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

See the root [README](README.md) and [SECURITY.md](SECURITY.md) for the full
production checklist.

---

## Troubleshooting quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `node: command not found` / wrong version | apt Node is 18 | Install Node 26 (§B.1) |
| `python3.13: command not found` | apt default is 3.12 | Add deadsnakes / pyenv (§B.2) |
| Backend won't start, mentions `changeme` | Placeholder left in `DATABASE_URL` | Set a real DB password (§A.3 / §B.4) |
| Backend won't start, mentions TOTP / Fernet key | `TOTP_ENCRYPTION_KEY` unset/malformed | Generate a Fernet key (§A.3) |
| `connection refused` to Postgres (native) | `DATABASE_URL` host is still `postgres` | Change host to `localhost` (§B.4) |
| `pytest` errors creating the test DB | `mathdefense` role lacks `CREATEDB` | `ALTER ROLE mathdefense CREATEDB;` (§B.3) |
| `emcc: command not found` during `npm run build` | No Emscripten on the host (the repo ships none) | Use Docker build or install Linux emsdk 5.0.7 (§ WASM) |
| `permission denied` on `docker.sock` | User not in `docker` group | `sudo usermod -aG docker $USER` then re-login |
| Prod frontend container crash-loops, nginx logs `cannot load certificate` | `./certs/{fullchain,privkey}.pem` missing | Provision certs before `up` (§ Production build) |
| Login silently fails (cookie never set) when reached via a LAN IP | `Secure` auth cookie dropped over plain HTTP to a non-localhost host | Reach the app as `localhost` via an SSH tunnel (§A.4) |

---

*For the architecture, game design, and API reference, see the root
[README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and
[backend/README.md](backend/README.md).*
