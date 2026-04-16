# Multi-stage build for the Vue 3 frontend.
#
# Targets:
#   - deps:  reproducible install via `npm ci` (cached layer shared by dev/build).
#   - dev:   runs vite dev-server; used by docker-compose.yml in development.
#            Builds with context = ./frontend.
#   - build: produces the static bundle consumed by nginx in production.
#   - prod:  nginx image serving the built dist.
#            Must be built with context = . (project root) so the root-level
#            nginx.conf is reachable. See docker-compose.prod.yml.

FROM node:22-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules /app/node_modules
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY frontend/ .
# Skip the `prebuild` lifecycle hook (= `cd ../wasm && make`) — emsdk is not
# installed in this image and the compiled WASM artifacts under public/wasm/
# are committed to the repo. Invoke vue-tsc + vite directly to bypass it.
RUN npx vue-tsc -b && npx vite build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
# Place nginx.conf as a template so Docker's entrypoint runs envsubst on
# ${CORS_ORIGIN_1} / ${CORS_ORIGIN_2} before nginx starts.
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV CORS_ORIGIN_1="http://localhost:5173" CORS_ORIGIN_2="http://localhost:3000"
EXPOSE 8080
