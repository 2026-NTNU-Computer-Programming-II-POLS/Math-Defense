#!/bin/sh
# M-13: Least-privilege PostgreSQL roles.
# Mounted as /docker-entrypoint-initdb.d/init-roles.sh in the postgres
# container so it runs once on first database creation. The default
# "mathdefense" superuser created by POSTGRES_USER is used only for
# Alembic migrations (DDL). Runtime queries go through "mathdefense_app"
# which has DML-only privileges.
#
# Only runs on first DB init (empty data directory). For existing
# deployments, run the SQL below manually via psql as the superuser.

set -e

: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"

# Role creation lives in a DO block (no psql variable expansion inside
# PL/pgSQL), so it carries no password. The password is set separately
# via ALTER ROLE using psql's :'var' safe-quoting to avoid injection.
psql -v ON_ERROR_STOP=1 \
     -v app_pw="$POSTGRES_APP_PASSWORD" \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
<<-'EOSQL'
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mathdefense_app') THEN
            CREATE ROLE mathdefense_app LOGIN;
        END IF;
    END
    $$;

    ALTER ROLE mathdefense_app PASSWORD :'app_pw';

    GRANT CONNECT ON DATABASE math_defense TO mathdefense_app;
    GRANT USAGE ON SCHEMA public TO mathdefense_app;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mathdefense_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO mathdefense_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mathdefense_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mathdefense_app;
EOSQL
