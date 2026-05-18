#!/bin/sh
# M-13: Least-privilege PostgreSQL roles.
# Mounted as /docker-entrypoint-initdb.d/init-roles.sh in the postgres
# container so it runs once on first database creation. The default
# "mathdefense" superuser created by POSTGRES_USER is used only for
# Alembic migrations (DDL). Runtime queries go through "mathdefense_app"
# which has DML-only privileges.

set -e

: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'mathdefense_app') THEN
            CREATE ROLE mathdefense_app LOGIN PASSWORD '${POSTGRES_APP_PASSWORD}';
        END IF;
    END
    \$\$;

    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO mathdefense_app;
    GRANT USAGE ON SCHEMA public TO mathdefense_app;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mathdefense_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO mathdefense_app;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mathdefense_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mathdefense_app;
EOSQL
