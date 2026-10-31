#!/usr/bin/env bash
# Real PostgreSQL two-session lock test within our disposable B2 Docker bridge.
set -euo pipefail
[[ "$B2_EPHEMERAL_CONFIRM" == "local-only" ]] || { echo 'BLOCKED: local-only required'; exit 3; }
[[ "$B2_NETWORK" == libread-issue137-b2-*-loopback ]] || { echo 'BLOCKED: dedicated B2 bridge required'; exit 3; }
DB_CONTAINER="$1"
docker ps -q --filter "network=$B2_NETWORK" | grep -Fxq "$DB_CONTAINER" || {
 echo 'BLOCKED: container not on dedicated ephemeral network'; exit 3;
}
sql() { docker exec "$DB_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
[[ "$(sql -At -c "select count(*) from storage.objects where bucket_id='f2p-disposable-promotion'")" == "1" ]] || {
 echo 'FAIL: local private object precondition'; exit 1;
}
[[ "$(sql -At -c "select public from storage.buckets where id='f2p-disposable-promotion'")" == "f" ]] || {
 echo 'FAIL: synthetic bucket is not PRIVATE'; exit 1;
}
[[ "$(sql -At -c "select public from storage.buckets where id='f2p-disposable-empty'")" == "t" ]] || {
 echo 'FAIL: empty unprotected bucket promotion was not persisted'; exit 1;
}
[[ "$(sql -At -c "select public from storage.buckets where id='r18-recording-audio'")" == "f" ]] || {
 echo 'FAIL: protected R18 bucket public flag changed'; exit 1;
}
holder=''
finish() { if [[ -n "$holder" ]]; then wait "$holder" || true; fi; }
trap finish EXIT
# Writer first: metadata UPDATE obtains bucket row FOR SHARE, so
# concurrent bucket-publicity UPDATE must wait on a genuine row lock.
sql -q -c "begin;
 update storage.objects set metadata=metadata where bucket_id='f2p-disposable-promotion';
 select pg_sleep(4); commit;" >/dev/null 2>&1 &
holder=$!
sleep 1
if out="$(sql -v VERBOSITY=sqlstate -c "set lock_timeout='450ms';
 update storage.buckets set public=true where id='f2p-disposable-promotion';" 2>&1)"; then
 echo 'FAIL: bucket promotion escaped writer lock'; exit 1
fi
case "$out" in *55P03*) ;; *) echo 'FAIL: no 55P03 bucket-waits-for-writer evidence'; exit 1 ;; esac
wait "$holder"
holder=''
# Bucket first: an UPDATE-class row lock must delay an existing object
# metadata write. A post-commit attempt still rejects nonempty publicity.
sql -q -c "begin;
 select public from storage.buckets where id='f2p-disposable-promotion' for update;
 select pg_sleep(4); commit;" >/dev/null 2>&1 &
holder=$!
sleep 1
if out="$(sql -v VERBOSITY=sqlstate -c "set lock_timeout='450ms';
 update storage.objects set metadata=metadata where bucket_id='f2p-disposable-promotion';" 2>&1)"; then
 echo 'FAIL: object writer escaped bucket update lock'; exit 1
fi
case "$out" in *55P03*) ;; *) echo 'FAIL: no 55P03 writer-waits-for-bucket evidence'; exit 1 ;; esac
wait "$holder"
holder=''
if out="$(sql -v VERBOSITY=sqlstate -c "update storage.buckets set public=true where id='f2p-disposable-promotion';" 2>&1)"; then
 echo 'FAIL: nonempty bucket incorrectly promoted'; exit 1
fi
case "$out" in *42501*) ;; *) echo 'FAIL: wrong final bucket-content rejection'; exit 1 ;; esac
[[ "$(sql -At -c "select public from storage.buckets where id='f2p-disposable-promotion'")" == "f" ]] || {
 echo 'FAIL: bucket lost PRIVATE flag'; exit 1;
}
echo 'PASS: F2-P real LOCAL PostgreSQL 55P03 lock contention both directions, final 42501, PRIVATE preserved'
