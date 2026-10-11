FROM postgres:17-bookworm
# Install pg_cron for the throwaway test server only. The official Postgres
# Debian image includes the PGDG APT repository for matching major packages.
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-17-cron \
  && rm -rf /var/lib/apt/lists/*
