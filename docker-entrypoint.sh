#!/bin/sh
# Unraid-style entrypoint: started as root, it hands the /data mount to PUID:PGID (default 99:100, Unraid's
# nobody:users), moves an old three-folder data dir into the new layout as that user, and drops to it for the server;
# started as any other user (docker run --user), it migrates and runs the server directly.
# The migrator is a no-op when there is no old tree; if it refuses or fails, set -e stops the container (no server start).
set -e
if [ "$(id -u)" = 0 ]; then
  PUID=${PUID:-99} PGID=${PGID:-100}
  d=${DATA_PATH:-/data}
  # chown only when something under the mount is owned by someone else: root-owned files from before the
  # upgrade are taken over once, later starts skip the walk
  [ -d "$d" ] && [ -n "$(find "$d" \( -not -user "$PUID" -o -not -group "$PGID" \) -print -quit)" ] &&
    chown -R "$PUID:$PGID" "$d"
  # no user lookup: su-exec takes numeric ids without an /etc/passwd entry, and HOME must be somewhere writable
  export HOME=/tmp
  su-exec "$PUID:$PGID" node /app/server/migrate.mjs --apply --data-path "$d"
  exec su-exec "$PUID:$PGID" "$@"
fi
node /app/server/migrate.mjs --apply --data-path "${DATA_PATH:-/data}"
exec "$@"
