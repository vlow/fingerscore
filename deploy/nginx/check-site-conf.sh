#!/usr/bin/env bash
# `nginx -t` of fingerscore.conf as the README installs it: the TODO paths filled with a self-signed certificate and
# this checkout's locations file. CI's nginx job runs it, so the site's own server block is checked, not only ci.conf.
#   deploy/nginx/check-site-conf.sh <repo>     (as root, on a machine with nginx and the brotli module)
set -euo pipefail
repo="${1:?usage: check-site-conf.sh <repo>}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=localhost -days 1 -keyout "$tmp/key.pem" -out "$tmp/cert.pem" 2>/dev/null
sed -e "s#/etc/letsencrypt/live/example.org/fullchain.pem#$tmp/cert.pem#" \
    -e "s#/etc/letsencrypt/live/example.org/privkey.pem#$tmp/key.pem#" \
    -e "s#/etc/nginx/fingerscore-locations.conf#$repo/deploy/nginx/fingerscore-locations.conf#" \
    "$repo/deploy/nginx/fingerscore.conf" > "$tmp/site.conf"
printf 'include /etc/nginx/modules-enabled/*.conf;\nevents {}\nhttp {\n    include /etc/nginx/mime.types;\n    include %s;\n}\n' "$tmp/site.conf" > "$tmp/nginx.conf"
nginx -t -c "$tmp/nginx.conf"
