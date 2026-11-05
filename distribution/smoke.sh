#!/bin/sh
# Starts an image the two ways it is installed and checks each answers: root + PUID/PGID (Docker, Unraid), and the
# unprivileged user + SERVER_PORT + /home/container that Pelican uses. Usage: distribution/smoke.sh [image]
set -eu
image=${1:-nova-prime-chummer:smoke}
run() { # name port docker-args...
  name=$1 port=$2
  shift 2
  docker run -d --rm --name "$name" -p "$port:$port" "$@" "$image" >/dev/null
  for _ in $(seq 60); do
    if curl -fs "http://127.0.0.1:$port/api/health" >/dev/null; then
      echo "ok: $name"
      docker stop -t 10 "$name" >/dev/null
      return
    fi
    sleep 1
  done
  docker logs "$name" | tail -20
  docker stop "$name" >/dev/null
  echo "FAILED: $name" >&2
  exit 1
}
run npc-smoke-docker 18480 -e PORT=18480
run npc-smoke-pelican 18481 --user 988:988 -e SERVER_PORT=18481 -e DATA_PATH=/home/container/data -e HOME=/home/container \
  --tmpfs /home/container:uid=988,gid=988 --read-only --tmpfs /tmp
