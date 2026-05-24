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
COPY frontend/src/math/wasm/math_engine.wasm /app/data/math_engine.wasm

# Drop root: a process escape or RCE inside the container should not land the
# attacker in a root shell. Chown /app so the app can still write to log paths
# under its working directory.
RUN groupadd --system app && useradd --system --gid app app \
    && chown -R app:app /app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
