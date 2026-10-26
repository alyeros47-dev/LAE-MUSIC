#!/bin/sh
set -eu
if [ "${NODE_ENV:-}" != staging ] || [ -n "${DATABASE_URL:-}" ]; then
  echo 'Review image requires staging mode and refuses external database configuration.' >&2
  exit 64
fi
export PATH="/usr/lib/postgresql/16/bin:$PATH"
review_data=/tmp/lae-review-postgres
review_pass=/tmp/lae-review-password
umask 077
if [ ! -f "$review_data/PG_VERSION" ]; then
  node -e 'require("fs").writeFileSync(process.argv[1],require("crypto").randomBytes(32).toString("hex"),{mode:0o600,flag:"wx"})' "$review_pass"
  initdb -D "$review_data" --username=postgres --auth-host=scram-sha-256 --auth-local=peer --pwfile="$review_pass" >/dev/null
fi
[ -f "$review_pass" ] || { echo 'Review database credential missing; refusing to reset data.' >&2; exit 65; }
pg_ctl -D "$review_data" -l /tmp/lae-review-postgres.log -o '-h 127.0.0.1 -p 55432 -k /tmp -c shared_buffers=32MB -c max_connections=30' -w start >/dev/null
review_child=''
cleanup() {
  if [ -n "$review_child" ]; then kill -TERM "$review_child" 2>/dev/null || true; wait "$review_child" 2>/dev/null || true; fi
  pg_ctl -D "$review_data" -m fast -w stop >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT
if ! psql -h /tmp -p 55432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='lae_music_review'" | grep -q 1; then
  createdb -h /tmp -p 55432 -U postgres lae_music_review
fi
review_password=$(cat "$review_pass")
export DATABASE_URL="postgres://postgres:${review_password}@127.0.0.1:55432/lae_music_review"
export DATABASE_SSL_MODE=local
unset review_password
node server.js &
review_child=$!
wait "$review_child"
