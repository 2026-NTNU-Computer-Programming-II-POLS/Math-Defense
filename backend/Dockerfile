# ── Stage 1: rebuild math_engine.wasm from the C source ──
# Server-side replay verification (session_service.recompute_total_score with
# total_score_fn=get_total_score_fn) loads this .wasm and calls
# compute_total_score on it. If we copied the committed binary directly, any
# formula change in wasm/math_engine.c that hadn't been re-`make`d locally
# would silently ship an outdated formula and disagree with the Python mirror
# the parity tests check. Rebuilding here makes the binary a deterministic
# function of the C source, the same way the GHA backend job does.
#
# Pin the emsdk tag (avoid `:latest`) so production builds are reproducible.
# Bump in lock-step with whatever version the GHA setup-emsdk action installs.
FROM emscripten/emsdk:5.0.7 AS wasm-builder
WORKDIR /build
COPY wasm/ /build/wasm/
# Makefile writes outputs to ../frontend/src/math/wasm relative to wasm/, so
# the target directory must exist before invoking emcc.
RUN mkdir -p /build/frontend/src/math/wasm \
    && cd /build/wasm && make

# ── Stage 2: runtime image ──
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Build context is the repo root so we can pull in both backend/ and shared/.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
# shared_constants.py resolves `/app/../shared` at runtime. In dev this is
# bind-mounted from docker-compose; in prod the image ships the files itself.
COPY shared /shared
# FU-A — server-side replay validation needs the same math_engine.wasm the
# frontend ships, so wasmtime-py can recompute scores via musl pow and the
# two figures agree bit-exactly. wasm_runtime.py looks here first.
RUN mkdir -p /app/data
COPY --from=wasm-builder /build/frontend/src/math/wasm/math_engine.wasm /app/data/math_engine.wasm

# Drop root: a process escape or RCE inside the container should not land the
# attacker in a root shell. Chown /app so the app can still write to log paths
# under its working directory.
RUN groupadd --system app && useradd --system --gid app app \
    && chown -R app:app /app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
