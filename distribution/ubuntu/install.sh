#!/usr/bin/env bash
# Nova Prime Chummer on Ubuntu LTS: install | update | uninstall (run with sudo).
# Run from a checkout or release tarball of the repo: the app is built in place from this script's repo root.
# Data lives in /var/lib/nova-prime-chummer (DATA_PATH, fixed); the server listens on 127.0.0.1:$PORT (put a proxy in front).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_PATH=/var/lib/nova-prime-chummer
SVC_USER=novaprime
UNIT=/etc/systemd/system/nova-prime-chummer.service
PORT="${PORT:-8480}"

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo $0 ${1:-install}" >&2; exit 1; }
case "$REPO/" in
  /home/* | /root/*)
    echo "Move the repo somewhere the service user can reach, such as /opt/nova-prime-chummer, then rerun (home folders are private)." >&2
    exit 1
    ;;
esac

build() {
  cd "$REPO"
  npm ci
  npm run build
  # the service group must read/traverse the app — group-scoped, not world: the checkout may hold secrets (.git, options.json)
  chgrp -R "$SVC_USER" "$REPO"
  chmod -R g+rX "$REPO"
}

migrate() { # no-op without an old three-folder tree; refuses safely (set -e stops us) and never deletes
  (cd "$REPO" && runuser -u "$SVC_USER" -- env DATA_PATH="$DATA_PATH" node server/migrate.mjs --apply --data-path "$DATA_PATH")
}

write_unit() {
  cat >"$UNIT" <<UNITEOF
[Unit]
Description=Nova Prime Chummer
After=network.target

[Service]
User=$SVC_USER
WorkingDirectory=$REPO
Environment=DATA_PATH=$DATA_PATH BIND_HOST=127.0.0.1 PORT=$PORT PYTHON=$REPO/.venv/bin/python STATIC_DIR=$REPO/dist
ExecStart=$(command -v node) server/server.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNITEOF
  systemctl daemon-reload
}

install_app() {
  # ponytail: NodeSource setup script and deadsnakes are trusted as-is; pin/verify keys if this must be hardened
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]; then
    apt-get update
    apt-get install -y curl ca-certificates gnupg
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  if ! python3.13 -c 'import venv, ensurepip' 2>/dev/null; then
    apt-get install -y software-properties-common
    add-apt-repository -y ppa:deadsnakes/ppa
    apt-get update
    apt-get install -y python3.13 python3.13-venv
  fi
  id "$SVC_USER" >/dev/null 2>&1 ||
    useradd --system --no-create-home --home-dir "$DATA_PATH" --shell /usr/sbin/nologin "$SVC_USER"
  install -d -o "$SVC_USER" -g "$SVC_USER" "$DATA_PATH"
  [ -x "$REPO/.venv/bin/python" ] || python3.13 -m venv "$REPO/.venv"
  "$REPO/.venv/bin/pip" install --require-hashes -r "$REPO/importer/requirements.lock"
  build
  write_unit
  migrate
  systemctl enable --now nova-prime-chummer
  echo "Running on http://127.0.0.1:$PORT (data: $DATA_PATH)"
}

update_app() {
  # ponytail: assumes a git checkout; for a tarball, unpack the new release over the old one first, then run update
  if [ -d "$REPO/.git" ]; then git -C "$REPO" pull --ff-only; fi
  "$REPO/.venv/bin/pip" install --require-hashes -r "$REPO/importer/requirements.lock"
  systemctl stop nova-prime-chummer
  build
  write_unit
  migrate
  systemctl start nova-prime-chummer
}

uninstall_app() {
  systemctl disable --now nova-prime-chummer 2>/dev/null || true
  # moved aside, not deleted
  [ -f "$UNIT" ] && mv "$UNIT" "$UNIT.removed"
  systemctl daemon-reload
  echo "Service removed. Your data is still in $DATA_PATH (and user $SVC_USER exists): remove them yourself if you want."
}

case "${1:-install}" in
  install) install_app ;;
  update) update_app ;;
  uninstall) uninstall_app ;;
  *) echo "Usage: $0 [install|update|uninstall]" >&2; exit 2 ;;
esac
