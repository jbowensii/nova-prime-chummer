#!/bin/sh
# Builds the app image and pushes it as <tag> and sha-<short> to the Forgejo registry and to GHCR (which tower04 pulls,
# as it can't reach Forgejo). Called by .forgejo/workflows/ci.yml (main: latest) and publish.yml. A registry whose
# token secret is empty is skipped with a warning. Env: SHA, REGISTRY_TOKEN, GHCR_USER, GHCR_TOKEN.
set -eu
tag=$1
sha=sha-$(printf %s "$SHA" | cut -c1-7)
docker build -t nova-prime-chummer:build .

push() { # registry user token repository secret-name
  if [ -z "$3" ]; then
    echo "::warning::$5 secret not set: image not pushed to $1"
    return 0
  fi
  printf %s "$3" | docker login "$1" -u "$2" --password-stdin
  for t in "$tag" "$sha"; do
    docker tag nova-prime-chummer:build "$4:$t"
    docker push "$4:$t"
  done
}
push github.local.owenshomeonline.com jbowensii "${REGISTRY_TOKEN:-}" github.local.owenshomeonline.com/jbowensii/nova-prime-chummer REGISTRY_TOKEN
push ghcr.io "${GHCR_USER:-jbowensii}" "${GHCR_TOKEN:-}" ghcr.io/jbowensii/nova-prime-chummer GHCR_TOKEN
