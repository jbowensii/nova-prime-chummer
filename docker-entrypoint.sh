#!/bin/sh
# Unraid-style entrypoint: started as root, it hands the data mounts to PUID:PGID (default 99:100, Unraid's
# nobody:users) and drops to that user; started as any other user (docker run --user), it just runs the server.
set -e
if [ "$(id -u)" = 0 ]; then
  PUID=${PUID:-99} PGID=${PGID:-100}
  for d in "$CHAR_DIR" "$CUSTOM_DIR" "$LIBRARY_DIR"; do
    # chown only when something under the mount is owned by someone else: root-owned files from before the
    # upgrade are taken over once, later starts skip the walk
    [ -d "$d" ] && [ -n "$(find "$d" \( -not -user "$PUID" -o -not -group "$PGID" \) -print -quit)" ] &&
      chown -R "$PUID:$PGID" "$d"
  done
  # no user lookup: su-exec takes numeric ids without an /etc/passwd entry, and HOME must be somewhere writable
  export HOME=/tmp
  exec su-exec "$PUID:$PGID" "$@"
fi
exec "$@"
